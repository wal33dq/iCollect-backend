import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { DateTime } from "luxon";
import { Record, RecordDocument } from "../schemas/record.schema";
import { UserRole } from "../../users/schemas/user-role.enum";

@Injectable()
export class RecordsEventsService {
  constructor(
    @InjectModel(Record.name) private readonly recordModel: Model<RecordDocument>
  ) {}


private readonly PT_ZONE = "America/Los_Angeles";

private dateOnlyIso(value: any): string | null {
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return null;
  // Always use the ISO calendar date so it doesn't drift by server timezone
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

/**
 * Interpret {scheduledDate, scheduledTime} as Pacific Time and return a UTC JS Date.
 * scheduledDate is treated as a calendar date (YYYY-MM-DD) regardless of server timezone.
 */
private ptDateTimeToUtc(scheduledDate: any, scheduledTime: string): Date {
  const iso = this.dateOnlyIso(scheduledDate);
  if (!iso) return new Date(scheduledDate);

  const [hRaw, mRaw] = String(scheduledTime || "00:00").split(":");
  const hour = Number(hRaw);
  const minute = Number(mRaw);

  const dt = DateTime.fromISO(iso, { zone: this.PT_ZONE }).set({
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0,
    second: 0,
    millisecond: 0,
  });

  return dt.isValid ? dt.toUTC().toJSDate() : new Date(scheduledDate);
}

private ptTimeFromDate(value: any): string {
  const d = value instanceof Date ? value : new Date(value);
  const dt = DateTime.fromJSDate(d).setZone(this.PT_ZONE);
  return dt.isValid ? dt.toFormat("HH:mm") : "00:00";
}

  async getScheduledEvents(
    user: any,
    startDate?: Date,
    endDate?: Date
  ): Promise<any[]> {
    const commentConditions: any = {
      scheduledDate: { $exists: true, $ne: null },
      isCompleted: false,
    };

    if (startDate && endDate) {
      commentConditions.scheduledDate = {
        ...commentConditions.scheduledDate,
        $gte: startDate,
        $lte: endDate,
      };
    }

    const query: any = { comments: { $elemMatch: commentConditions } };

    // Collector filter
    if (
      user.role === UserRole.COLLECTOR &&
      user.userId &&
      Types.ObjectId.isValid(user.userId)
    ) {
      query.assignedCollector = new Types.ObjectId(user.userId);
    }

    // Provider filter
    if (user.role === UserRole.PROVIDER) {
      const providerName = (user.fullName || user.username || "").trim();
      if (providerName) {
        const escapedName = providerName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        query.provider = { $regex: new RegExp(`^\\s*${escapedName}\\s*$`, "i") };
      }
    }

    const records = await this.recordModel
      .find(query)
      .populate("assignedCollector", "username")
      .populate("comments.author", "username")
      .exec();

    const events: any[] = [];

    records.forEach((record) => {
      const latestEventComment = record.comments
        .filter((comment: any) => {
          if (!comment.scheduledDate || comment.isCompleted) return false;
          const eventDate = new Date(comment.scheduledDate);
          if (startDate && eventDate < startDate) return false;
          if (endDate && eventDate > endDate) return false;
          return true;
        })
        .sort(
          (a: any, b: any) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )[0];

      if (latestEventComment) {
        events.push({
          recordId: record._id,
          commentId: latestEventComment._id,
          ptName: record.ptName,
          text: latestEventComment.text,
          status: latestEventComment.status,
          scheduledDate: latestEventComment.scheduledDate,
          scheduledTime: latestEventComment.scheduledTime,
          offerAmount: latestEventComment.offerAmount,
          author: latestEventComment.author,
          assignedCollector: record.assignedCollector,
          createdAt: latestEventComment.createdAt,
        });
      }
    });

    events.sort(
      (a, b) =>
        new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime()
    );

    return events;
  }

  async getNotifications(userId?: string, userRole?: UserRole): Promise<any[]> {
  const nowUtc = new Date();
  const oneHourFromNowUtc = new Date(nowUtc.getTime() + 60 * 60 * 1000);

  const matchConditions: any = {
    "comments.isCompleted": false,
    "comments.scheduledTime": { $exists: true, $ne: null },
    "comments.scheduledDate": { $exists: true, $ne: null },
  };

  if (userId && Types.ObjectId.isValid(userId)) {
    matchConditions.assignedCollector = new Types.ObjectId(userId);
  }

  return this.recordModel
    .find(matchConditions)
    .populate("assignedCollector", "username")
    .populate("comments.author", "username")
    .exec()
    .then(async (records) => {
      const notifications: any[] = [];

      records.forEach((record) => {
        const latestIncompleteComment = record.comments
          .filter((c: any) => !c.isCompleted && c.scheduledDate && c.scheduledTime)
          .sort((a: any, b: any) => {
            const aUtc = this.ptDateTimeToUtc(a.scheduledDate, a.scheduledTime);
            const bUtc = this.ptDateTimeToUtc(b.scheduledDate, b.scheduledTime);
            return bUtc.getTime() - aUtc.getTime();
          })[0];

        if (!latestIncompleteComment) return;

        try {
          const scheduledUtc = this.ptDateTimeToUtc(
            latestIncompleteComment.scheduledDate,
            latestIncompleteComment.scheduledTime
          );

          if (isNaN(scheduledUtc.getTime())) return;

          const isUpcoming =
            scheduledUtc > nowUtc && scheduledUtc <= oneHourFromNowUtc;
          const isActive =
            scheduledUtc <= nowUtc && scheduledUtc >= new Date(nowUtc.getTime() - 60 * 60 * 1000);
          const isOverdue = scheduledUtc < new Date(nowUtc.getTime() - 60 * 60 * 1000);

          let shouldAdd = false;
          if (userRole === UserRole.ADMIN || userRole === UserRole.SUPER_ADMIN) {
            if (isOverdue) shouldAdd = true;
          } else if (userRole === UserRole.COLLECTOR) {
            if (isUpcoming || isActive) shouldAdd = true;
          }

          if (shouldAdd) {
            notifications.push({
              recordId: record._id,
              commentId: latestIncompleteComment._id,
              ptName: record.ptName,
              text: latestIncompleteComment.text,
              status: latestIncompleteComment.status,
              scheduledDate: latestIncompleteComment.scheduledDate,
              scheduledTime: latestIncompleteComment.scheduledTime,
              author: latestIncompleteComment.author,
              assignedCollector: record.assignedCollector,
              isOverdue,
              isAssignment: false,
            });
          }
        } catch (e) {
          console.error("Error processing notification for record:", record._id, e);
        }
      });

      // New assignment notifications (collectors only)
      if (userRole === UserRole.COLLECTOR && userId && Types.ObjectId.isValid(userId)) {
        const twentyFourHoursAgo = new Date(nowUtc.getTime() - 24 * 60 * 60 * 1000);

        const assignedRecords = await this.recordModel
          .find({
            assignedCollector: new Types.ObjectId(userId),
            assignedAt: { $gte: twentyFourHoursAgo },
          })
          .populate("assignedCollector", "username")
          .populate("comments.author", "_id")
          .exec();

        assignedRecords.forEach((record) => {
          const hasActivity = record.comments.some((comment: any) => {
            if (!comment.createdAt) return false;

            const commentAuthorId = (comment.author as any)._id
              ? (comment.author as any)._id.toString()
              : comment.author.toString();

            if (commentAuthorId !== userId.toString()) return false;

            return new Date(comment.createdAt) > new Date((record as any).assignedAt);
          });

          if (hasActivity) return;

          const exists = notifications.some(
            (n) => n.recordId.toString() === record._id.toString()
          );

          if (!exists) {
            const assignedAt = (record as any).assignedAt;
            notifications.push({
              recordId: record._id,
              ptName: record.ptName,
              text: `New record assigned: ${record.ptName}`,
              status: "Assigned",
              scheduledDate: assignedAt,
              // keep consistent "HH:mm" so frontend sorting/parsing doesn't break
              scheduledTime: this.ptTimeFromDate(assignedAt),
              assignedCollector: record.assignedCollector,
              isAssignment: true,
              isOverdue: false,
            });
          }
        });
      }

      notifications.sort((a, b) => {
        const aUtc = this.ptDateTimeToUtc(a.scheduledDate, a.scheduledTime);
        const bUtc = this.ptDateTimeToUtc(b.scheduledDate, b.scheduledTime);
        return aUtc.getTime() - bUtc.getTime();
      });

      return notifications;
    });
}

  async getOverdueEvents(): Promise<any[]> {
    const now = new Date();

    const records = await this.recordModel
      .find({
        comments: {
          $elemMatch: {
            isCompleted: false,
            scheduledDate: { $exists: true, $ne: null },
          },
        },
      })
      .populate("assignedCollector", "username")
      .populate("comments.author", "username")
      .exec();

    const overdueTasks: any[] = [];

    records.forEach((record) => {
      try {
        const latestIncompleteComment = record.comments
          .filter((c: any) => !c.isCompleted && c.scheduledDate)
          .sort(
            (a: any, b: any) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )[0];

        if (!latestIncompleteComment) return;

        const eventDateObj = new Date(latestIncompleteComment.scheduledDate);
        let eventEndTime: Date;

        if (latestIncompleteComment.scheduledTime) {
          const [hours, minutes] = latestIncompleteComment.scheduledTime
            .split(":")
            .map(Number);

          const eventStartTime = new Date(
            eventDateObj.getUTCFullYear(),
            eventDateObj.getUTCMonth(),
            eventDateObj.getUTCDate(),
            hours,
            minutes
          );

          eventEndTime = new Date(eventStartTime.getTime() + 15 * 60 * 1000);
        } else {
          eventEndTime = new Date(
            eventDateObj.getUTCFullYear(),
            eventDateObj.getUTCMonth(),
            eventDateObj.getUTCDate(),
            23,
            59,
            59,
            999
          );
        }

        if (now > eventEndTime) {
          overdueTasks.push({
            recordId: record._id,
            commentId: latestIncompleteComment._id,
            ptName: record.ptName,
            text: latestIncompleteComment.text,
            scheduledDate: latestIncompleteComment.scheduledDate,
            scheduledTime: latestIncompleteComment.scheduledTime,
            author: latestIncompleteComment.author,
            assignedCollector: record.assignedCollector,
          });
        }
      } catch (e) {
        console.error(`Failed to process overdue event for record ${record._id}:`, e);
      }
    });

    overdueTasks.sort((a, b) => {
      const dateAObj = new Date(a.scheduledDate);
      const [hourA, minA] = a.scheduledTime ? a.scheduledTime.split(":").map(Number) : [0, 0];
      const dateA = new Date(
        Date.UTC(dateAObj.getUTCFullYear(), dateAObj.getUTCMonth(), dateAObj.getUTCDate(), hourA, minA)
      );

      const dateBObj = new Date(b.scheduledDate);
      const [hourB, minB] = b.scheduledTime ? b.scheduledTime.split(":").map(Number) : [0, 0];
      const dateB = new Date(
        Date.UTC(dateBObj.getUTCFullYear(), dateBObj.getUTCMonth(), dateBObj.getUTCDate(), hourB, minB)
      );

      return dateA.getTime() - dateB.getTime();
    });

    return overdueTasks;
  }

  async getHearingEvents(startDate?: Date, endDate?: Date): Promise<any[]> {
    const query: any = { hearingDate: { $exists: true, $ne: null } };

    if (startDate && endDate) {
      query.hearingDate = { $gte: startDate, $lte: endDate };
    }

    const records = await this.recordModel
      .find(query)
      .populate("assignedCollector", "username")
      .populate("comments.author", "username")
      .exec();

    const events = records.map((record) => {
      const latestComment =
        record.comments && record.comments.length > 0
          ? record.comments.sort(
              (a: any, b: any) =>
                new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            )[0]
          : null;

      return {
        recordId: record._id,
        provider: record.provider,
        ptName: record.ptName,
        adjNumber: record.adjNumber,
        caseStatus: record.caseStatus,
        hearingStatus: record.hearingStatus,
        hearingDate: record.hearingDate,
        hearingTime: record.hearingTime,
        judgeName: record.judgeName,
        courtRoomlink: record.courtRoomlink,
        judgePhone: record.judgePhone,
        AccesCode: record.AccesCode,
        boardLocation: record.boardLocation,
        pmrStatus: record.pmrStatus,
        dorFiledBy: record.dorFiledBy,
        status4903_8: record.status4903_8,
        judgeOrderStatus: record.judgeOrderStatus,
        assignedCollector: record.assignedCollector,
        author: latestComment ? latestComment.author : null,
      };
    });

    events.sort(
      (a, b) =>
        new Date(a.hearingDate).getTime() - new Date(b.hearingDate).getTime()
    );

    return events;
  }
}