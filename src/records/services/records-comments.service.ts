import { Injectable, BadRequestException, ForbiddenException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { Record, RecordDocument } from "../schemas/record.schema";
import { UserRole } from "../../users/schemas/user-role.enum";

@Injectable()
export class RecordsCommentsService {
  constructor(
    @InjectModel(Record.name) private readonly recordModel: Model<RecordDocument>
  ) {}

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

    if (
      (commentData.status === "closed" || commentData.status === "payment_received") &&
      user.role !== UserRole.ADMIN &&
      user.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException(
        "Only administrators or super admins can use this status."
      );
    }

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

    return this.recordModel
      .findByIdAndUpdate(
        recordId,
        { $push: { comments: { $each: [newComment], $position: 0 } } },
        { new: true }
      )
      .populate("assignedCollector", "username")
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
      .populate("comments.author", "username")
      .exec();
  }
}
