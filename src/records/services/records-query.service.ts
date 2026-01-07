import { Injectable, BadRequestException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { Record, RecordDocument } from "../schemas/record.schema";
import { UserRole } from "../../users/schemas/user-role.enum";

@Injectable()
export class RecordsQueryService {
  constructor(
    @InjectModel(Record.name) private readonly recordModel: Model<RecordDocument>
  ) {}

  async getUniqueProviders(): Promise<string[]> {
    const providers = await this.recordModel
      .distinct("provider", { provider: { $exists: true, $ne: "" } })
      .exec();

    return providers.sort();
  }

  async findAll(
    user: any,
    collectorId?: string,
    page: number = 1,
    limit: number = 25,
    search?: string,
    category?: string
  ): Promise<{ data: any[]; total: number; page: number; limit: number }> {
    const skip = (page - 1) * limit;
    const baseQuery: any = {};
    let collectorObjectId: Types.ObjectId | null = null;

    // Provider Role filter (Case Insensitive + Whitespace tolerant)
    if (user.role === UserRole.PROVIDER) {
      const providerName = (user.fullName || user.username || "").trim();
      if (!providerName) return { data: [], total: 0, page, limit };

      const escapedName = providerName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      baseQuery.provider = { $regex: new RegExp(`^\\s*${escapedName}\\s*$`, "i") };
    }

    // Collector filter
    if (collectorId) {
      if (collectorId === "unassigned") {
        baseQuery.$or = [
          { assignedCollector: null },
          { assignedCollector: { $exists: false } },
        ];
      } else if (Types.ObjectId.isValid(collectorId)) {
        collectorObjectId = new Types.ObjectId(collectorId);
        baseQuery.assignedCollector = collectorObjectId;
      } else if (user.role === UserRole.COLLECTOR) {
        collectorObjectId = new Types.ObjectId(user.userId);
        baseQuery.assignedCollector = collectorObjectId;
      }
    } else if (user.role === UserRole.COLLECTOR) {
      collectorObjectId = new Types.ObjectId(user.userId);
      baseQuery.assignedCollector = collectorObjectId;
    }

    // Search
    if (search) {
      const searchRegex = new RegExp(search, "i");
      const searchConditions = [
        { provider: searchRegex },
        { ptName: searchRegex },
        { "adjNumber.value": searchRegex },
        { lienStatus: searchRegex },
        { caseStatus: searchRegex },
        { "comments.status": searchRegex },
        { referenceId: searchRegex },
      ];

      if (baseQuery.$or) {
        baseQuery.$and = [{ $or: baseQuery.$or }, { $or: searchConditions }];
        delete baseQuery.$or;
      } else {
        baseQuery.$or = searchConditions;
      }
    }

    if (category === "history" && collectorObjectId) {
      baseQuery["comments.author"] = collectorObjectId;
    } else if (category === "active" && collectorObjectId) {
      baseQuery["comments.author"] = { $ne: collectorObjectId };
    }

    const total = await this.recordModel.countDocuments(baseQuery);

    const data = await this.recordModel
      .find(baseQuery)
      .populate("assignedCollector", "username")
      .populate("comments.author", "username")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec();

    const processedData = data.map((doc) => {
      const record = doc.toObject() as Record & { lastCommentDate?: Date | null };

      if (category === "history" && collectorObjectId) {
        const userComments = record.comments
          .filter((c: any) => {
            if (!c.author) return false;
            const authorId = (c.author as any)._id
              ? (c.author as any)._id.toString()
              : c.author.toString();
            return authorId === collectorObjectId.toString();
          })
          .sort(
            (a: any, b: any) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );

        record.lastCommentDate = userComments.length > 0 ? userComments[0].createdAt : null;
      }

      return record;
    });

    return { data: processedData, total, page, limit };
  }

  async findById(id: string): Promise<Record> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException("Invalid record ID format.");
    }

    const record = await this.recordModel
      .findById(id)
      .populate("assignedCollector", "username")
      .populate("comments.author", "username")
      .exec();

    if (!record) throw new BadRequestException("Record not found");
    return record;
  }
}
