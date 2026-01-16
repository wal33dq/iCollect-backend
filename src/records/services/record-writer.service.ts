import { Injectable, BadRequestException, ForbiddenException, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { Record, RecordDocument } from "../schemas/record.schema";
import { CreateRecordDto } from "../dto/create-record.dto";
import { UserRole } from "../../users/schemas/user-role.enum";

@Injectable()
export class RecordWriterService {
  private readonly logger = new Logger(RecordWriterService.name);

  constructor(
    @InjectModel(Record.name) private readonly recordModel: Model<RecordDocument>
  ) {}

  private toObjectId(value?: string | Types.ObjectId): Types.ObjectId | null {
    if (!value) return null;
    if (value instanceof Types.ObjectId) return value;
    if (Types.ObjectId.isValid(value)) {
      return new Types.ObjectId(value);
    }
    return null;
  }

  private toObjectIdFromRef(value: any): Types.ObjectId | null {
    if (!value) return null;
    if (value instanceof Types.ObjectId) return value;
    if (value._id) {
      return this.toObjectId(value._id);
    }
    return this.toObjectId(value);
  }

  // ==========================================
  // Reference ID Logic (Helpers Only)
  // ==========================================

  private async getNextSequenceNumber(): Promise<number> {
    const lastRecord = await this.recordModel
      .findOne({ referenceId: { $regex: /^REF-/ } })
      .sort({ referenceId: -1 })
      .collation({ locale: "en_US", numericOrdering: true })
      .select("referenceId")
      .exec();

    if (!lastRecord || !lastRecord.referenceId) return 1;

    const parts = lastRecord.referenceId.split("-");
    if (parts.length < 2) return 1;

    const lastNum = parseInt(parts[1], 10);
    return isNaN(lastNum) ? 1 : lastNum + 1;
  }

  private formatReferenceId(num: number): string {
    return `REF-${num.toString().padStart(7, "0")}`;
  }

  // ==========================================

  async create(createRecordDto: CreateRecordDto, actor?: any): Promise<Record> {
    const payload: any = { ...createRecordDto };

    if (payload.assignedCollector) {
      if (!Types.ObjectId.isValid(payload.assignedCollector)) {
        throw new BadRequestException("Invalid collectorId format.");
      }

      payload.assignedCollector = new Types.ObjectId(payload.assignedCollector);
      // Set assignedAt when creating with a collector
      const assignedAt = new Date();
      payload.assignedAt = assignedAt;

      const assignedBy = this.toObjectId(actor?.userId || actor?._id);
      if (assignedBy) {
        payload.assignedBy = assignedBy;
        payload.assignmentHistory = [
          {
            fromCollector: null,
            toCollector: payload.assignedCollector,
            assignedBy,
            assignedAt,
          },
        ];
      }
    }

    // Outstanding calc
    if (
      payload.bill !== undefined &&
      payload.paid !== undefined &&
      payload.bill !== null &&
      payload.paid !== null
    ) {
      payload.outstanding = payload.bill - payload.paid;
    } else if (payload.bill !== undefined && payload.bill !== null) {
      payload.outstanding = payload.bill;
    }

    // Generate immutable Reference ID
    const nextSeq = await this.getNextSequenceNumber();
    payload.referenceId = this.formatReferenceId(nextSeq);

    const createdRecord = new this.recordModel({
      ...payload,
      recordCreatedAt: new Date(),
    });

    return createdRecord.save();
  }

  async reassignMany(
    recordIds: string[],
    collectorId: string,
    actor?: any
  ): Promise<{ modifiedCount: number }> {
    let collectorValue: Types.ObjectId | null = null;

    if (collectorId === "unassigned") {
      collectorValue = null;
    } else if (Types.ObjectId.isValid(collectorId)) {
      collectorValue = new Types.ObjectId(collectorId);
    } else {
      throw new BadRequestException("Invalid collectorId format.");
    }

    const validRecordIds = recordIds
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    if (validRecordIds.length !== recordIds.length) {
      throw new BadRequestException("One or more invalid record IDs provided.");
    }

    const records = await this.recordModel
      .find({ _id: { $in: validRecordIds } })
      .select("_id assignedCollector")
      .exec();

    if (records.length === 0) {
      return { modifiedCount: 0 };
    }

    const assignedAt = new Date();
    const assignedBy = this.toObjectId(actor?.userId || actor?._id);

    const operations = records.map((record) => {
      const fromCollector = this.toObjectIdFromRef(record.assignedCollector);

      return {
        updateOne: {
          filter: { _id: record._id },
          update: {
            $set: {
              assignedCollector: collectorValue,
              assignedAt,
              assignedBy,
            },
            $push: {
              assignmentHistory: {
                fromCollector,
                toCollector: collectorValue,
                assignedBy,
                assignedAt,
              },
            },
          },
        },
      };
    });

    const result = await this.recordModel.bulkWrite(operations);

    return { modifiedCount: result.modifiedCount };
  }

  async assignCollector(
    id: string,
    collectorId: string,
    actor?: any
  ): Promise<Record> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException("Invalid record ID format.");
    }

    let collectorValue: Types.ObjectId | null = null;

    if (collectorId === "unassigned") {
      collectorValue = null;
    } else if (Types.ObjectId.isValid(collectorId)) {
      collectorValue = new Types.ObjectId(collectorId);
    } else {
      throw new BadRequestException("Invalid collectorId format.");
    }

    const existingRecord = await this.recordModel
      .findById(id)
      .select("_id assignedCollector")
      .exec();

    if (!existingRecord) {
      throw new BadRequestException("Record not found");
    }

    const assignedAt = new Date();
    const assignedBy = this.toObjectId(actor?.userId || actor?._id);
    const fromCollector = this.toObjectIdFromRef(existingRecord.assignedCollector);

    const record = await this.recordModel
      .findByIdAndUpdate(
        id,
        {
          $set: {
            assignedCollector: collectorValue,
            assignedAt,
            assignedBy,
          },
          $push: {
            assignmentHistory: {
              fromCollector,
              toCollector: collectorValue,
              assignedBy,
              assignedAt,
            },
          },
        },
        { new: true }
      )
      .populate("assignedCollector", "username fullName")
      .populate("assignedBy", "username fullName")
      .populate("comments.author", "username")
      .exec();

    return record;
  }

  async update(id: string, updateData: any, user: any): Promise<Record> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException("Invalid record ID format.");
    }

    // Prevent non-admins from changing Provider
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      delete updateData.provider;
    }

    if (updateData.bill !== undefined || updateData.paid !== undefined) {
      const record = await this.recordModel.findById(id);
      if (!record) throw new BadRequestException("Record not found");

      const newBill = updateData.bill !== undefined ? updateData.bill : record.bill;
      const newPaid = updateData.paid !== undefined ? updateData.paid : record.paid;

      if (
        newBill !== undefined &&
        newPaid !== undefined &&
        newBill !== null &&
        newPaid !== null
      ) {
        updateData.outstanding = newBill - newPaid;
      } else if (newBill !== undefined && newBill !== null) {
        updateData.outstanding = newBill;
      }
    }

    // Protect Reference ID from manual updates
    delete updateData.referenceId;

    const updatedRecord = await this.recordModel
      .findByIdAndUpdate(id, updateData, { new: true })
      .populate("assignedCollector", "username")
      .populate("comments.author", "username")
      .exec();

    if (!updatedRecord) throw new BadRequestException("Record not found");
    return updatedRecord;
  }

  async deleteMany(ids: string[]): Promise<{ deletedCount: number }> {
    const validIds = ids
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    if (validIds.length !== ids.length) {
      throw new BadRequestException("One or more invalid record IDs were provided.");
    }

    const result = await this.recordModel.deleteMany({ _id: { $in: validIds } });
    return { deletedCount: result.deletedCount };
  }
}
