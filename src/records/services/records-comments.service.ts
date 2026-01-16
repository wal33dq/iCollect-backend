import {
  Injectable,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";

import { Record, RecordDocument } from "../schemas/record.schema";
import { UserRole } from "../../users/schemas/user-role.enum";
import { UsersService } from "../../users/users.service";

// ✅ local helper type: Mongoose User doc shape (at least _id)
type UserWithId = { _id: Types.ObjectId | string; username?: string; fullName?: string };

@Injectable()
export class RecordsCommentsService {
  constructor(
    @InjectModel(Record.name) private readonly recordModel: Model<RecordDocument>,
    private readonly usersService: UsersService
  ) {}

  /**
   * Pick a Payment Redeemer to assign.
   * Strategy: pick the redeemer with the smallest current WFP queue.
   */
  private async pickPaymentRedeemerId(): Promise<string | null> {
    const redeemersRaw = await this.usersService.findAll({
      role: UserRole.PAYMENT_REDEEMER,
    });

    // ✅ Fix typing: treat results as docs with _id
    const redeemers = (redeemersRaw as unknown as UserWithId[]) || [];
    if (redeemers.length === 0) return null;

    const firstId = redeemers[0]?._id;
    if (!firstId) return null;

    let bestId = firstId.toString();
    let bestCount = Number.MAX_SAFE_INTEGER;

    for (const r of redeemers) {
      const rid = r?._id?.toString();
      if (!rid || !Types.ObjectId.isValid(rid)) continue;

      const count = await this.recordModel.countDocuments({
        assignedPaymentRedeemer: new Types.ObjectId(rid),
        "comments.0.status": "wfp",
        "comments.0.isCompleted": false,
      });

      if (count < bestCount) {
        bestCount = count;
        bestId = rid;
      }
    }

    return bestId;
  }

  async addComment(
    recordId: string,
    commentData: {
      text: string;
      status: string;
      scheduledDate?: Date;
      scheduledTime?: string;
      offerAmount?: number;
    },
    user: any
  ): Promise<Record> {
    if (!Types.ObjectId.isValid(recordId)) {
      throw new BadRequestException("Invalid record ID format.");
    }

    // Only admins can close or mark payment received.
    if (
      (commentData.status === "closed" ||
        commentData.status === "payment_received") &&
      user.role !== UserRole.ADMIN &&
      user.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException(
        "Only administrators or super admins can use this status."
      );
    }

    // Complete previous open scheduled tasks
    await this.recordModel.updateOne(
      { _id: recordId },
      {
        $set: {
          "comments.$[elem].isCompleted": true,
          "comments.$[elem].completedAt": new Date(),
        },
      },
      {
        arrayFilters: [
          {
            "elem.isCompleted": false,
            "elem.scheduledDate": { $exists: true },
          },
        ],
      }
    );

    const newComment = {
      _id: new Types.ObjectId(),
      text: commentData.text,
      status: commentData.status,
      author: new Types.ObjectId(user.userId),
      scheduledDate: commentData.scheduledDate,
      scheduledTime: commentData.scheduledTime,
      offerAmount: commentData.offerAmount,
      isCompleted: false,
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const update: any = {
      $push: { comments: { $each: [newComment], $position: 0 } },
    };

    // ✅ If WFP => assign payment redeemer
    if (commentData.status === "wfp") {
      const redeemerId = await this.pickPaymentRedeemerId();

      if (redeemerId && Types.ObjectId.isValid(redeemerId)) {
        update.$set = {
          ...(update.$set || {}),
          assignedPaymentRedeemer: new Types.ObjectId(redeemerId),
          paymentAssignedAt: new Date(),
          paymentAssignedBy: new Types.ObjectId(user.userId),
        };
      }
    }

    // ✅ If payment received OR closed => clear payment redeemer assignment
    if (commentData.status === "payment_received" || commentData.status === "closed") {
      update.$set = {
        ...(update.$set || {}),
        assignedPaymentRedeemer: null,
        paymentAssignedAt: null,
        paymentAssignedBy: null,
      };
    }

    return this.recordModel
      .findByIdAndUpdate(recordId, update, { new: true })
      .populate("assignedCollector", "username")
      .populate("assignedPaymentRedeemer", "username")
      .populate("comments.author", "username")
      .exec();
  }

  async updateComment(
    recordId: string,
    commentId: string,
    updateData: { isCompleted?: boolean },
    user: any
  ): Promise<Record> {
    if (!Types.ObjectId.isValid(recordId)) {
      throw new BadRequestException("Invalid record ID format.");
    }
    if (!Types.ObjectId.isValid(commentId)) {
      throw new BadRequestException("Invalid comment ID format.");
    }

    const updateQuery: any = {};
    if (updateData.isCompleted !== undefined) {
      updateQuery["comments.$.isCompleted"] = updateData.isCompleted;
      updateQuery["comments.$.updatedAt"] = new Date();
      if (updateData.isCompleted) {
        updateQuery["comments.$.completedAt"] = new Date();
      }
    }

    return this.recordModel
      .findOneAndUpdate(
        { _id: recordId, "comments._id": commentId },
        { $set: updateQuery },
        { new: true }
      )
      .populate("assignedCollector", "username")
      .populate("assignedPaymentRedeemer", "username")
      .populate("comments.author", "username")
      .exec();
  }
}
