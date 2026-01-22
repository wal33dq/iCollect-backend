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
    
      // Payment Received extra fields (Payment Redeemer only)
      checkNumber?: string;
      checkDate?: Date;
      checkAmount?: number;
      checkCopy?: { fileName: string; mimeType: string; base64: string };
    },
    user: any
  ): Promise<Record> {
    if (!Types.ObjectId.isValid(recordId)) {
      throw new BadRequestException("Invalid record ID format.");
    }

    // Role rules:
// - closed: Admin/Super Admin only
// - payment_received: Payment Redeemer only
    if (
      commentData.status === "closed" &&
      user.role !== UserRole.ADMIN &&
      user.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException(
        "Only administrators or super admins can use this status."
      );
    }

    if (
      commentData.status === "payment_received" &&
      user.role !== UserRole.PAYMENT_REDEEMER
    ) {
      throw new ForbiddenException(
        "Only Payment Redeemer can add 'Payment Received' comments."
      );
    }

    // Validation for payment_received details
    if (commentData.status === "payment_received") {
      const checkNumber = (commentData.checkNumber || "").trim();
      const checkDate = commentData.checkDate;
      const amount = commentData.checkAmount;
      const copy = commentData.checkCopy;

      if (!checkNumber) {
        throw new BadRequestException("Check Number is required.");
      }
      if (!checkDate) {
        throw new BadRequestException("Check Date is required.");
      }
      if (amount === undefined || amount === null || Number(amount) <= 0) {
        throw new BadRequestException("Check Amount must be greater than 0.");
      }
      if (!copy || !copy.base64) {
        throw new BadRequestException("Attach Copy of Check is required.");
      }

      // ~5MB base64 guard (approx)
      const approxBytes = Math.floor((copy.base64.length * 3) / 4);
      const maxBytes = 5 * 1024 * 1024;
      if (approxBytes > maxBytes) {
        throw new BadRequestException("Check copy file too large. Max 5MB.");
      }
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
      
      checkNumber: commentData.checkNumber,
      checkDate: commentData.checkDate,
      checkAmount: commentData.checkAmount,
      checkCopy: commentData.checkCopy,
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
      .exec()
      .then((rec) => this.sanitizeRecordForRole(rec, user));
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
      .exec()
      .then((rec) => this.sanitizeRecordForRole(rec, user));
  }

  private sanitizeRecordForRole(record: any, user: any) {
    if (!record || !user) return record;

    const role = (user.role || "").toString().toLowerCase();

    // Hide 'payment_received' comments from Collector + Hiring Representative (+ Provider).
    // Payment Redeemer/Admin/Super Admin can view.
    const cannotSee =
      role === "collector" || role === "hiring_representative" || role === "provider";

    if (cannotSee && Array.isArray(record.comments)) {
      record.comments = record.comments.filter(
        (c: any) => c && c.status !== "payment_received"
      );
    }

    return record;
  }

}
