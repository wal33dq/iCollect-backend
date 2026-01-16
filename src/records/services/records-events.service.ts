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
    return d.toISOString().slice(0, 10); // YYYY-MM-DD
  }

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

  async getScheduledEvents(user: any, startDate?: Date, endDate?: Date): Promise<any[]> {
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
    if (user.role === UserRole.COLLECTOR && user.userId && Types.ObjectId.isValid(user.userId)) {
      query.assignedCollector = new Types.ObjectId(user.userId);
    }

    // ✅ Payment Redeemer filter: only their assigned + only WFP comments in calendar
    if (user.role === UserRole.PAYMENT_REDEEMER && user.userId && Types.ObjectId.isValid(user.userId)) {
      query.assignedPaymentRedeemer = new Types.ObjectId(user.userId);
      commentConditions.status = "wfp";
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
      .populate("assignedPaymentRedeemer", "username")
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
        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

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
          assignedPaymentRedeemer: (record as any).assignedPaymentRedeemer,
          createdAt: latestEventComment.createdAt,
        });
      }
    });

    events.sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime());
    return events;
  }

  async getNotifications(userId?: string, userRole?: UserRole): Promise<any[]> {
    const nowUtc = new Date();

    const matchConditions: any = {
      "comments.isCompleted": false,
      "comments.scheduledTime": { $exists: true, $ne: null },
      "comments.scheduledDate": { $exists: true, $ne: null },
    };

    // ✅ Role-based matching
    if (userId && Types.ObjectId.isValid(userId)) {
      if (userRole === UserRole.PAYMENT_REDEEMER) {
        matchConditions.assignedPaymentRedeemer = new Types.ObjectId(userId);
        matchConditions["comments.status"] = "wfp";
      } else {
        matchConditions.assignedCollector = new Types.ObjectId(userId);
      }
    }

    const records = await this.recordModel
      .find(matchConditions)
      .populate("assignedCollector", "username")
      .populate("assignedPaymentRedeemer", "username")
      .populate("comments.author", "username")
      .exec();

    const notifications: any[] = [];

    // Scheduled alerts (upcoming/overdue rules)
    records.forEach((record) => {
      const latestIncompleteComment = record.comments
        .filter((c: any) => !c.isCompleted && c.scheduledDate && c.scheduledTime)
        .sort((a: any, b: any) => {
          const aUtc = this.ptDateTimeToUtc(a.scheduledDate, a.scheduledTime);
          const bUtc = this.ptDateTimeToUtc(b.scheduledDate, b.scheduledTime);
          return bUtc.getTime() - aUtc.getTime();
        })[0];

      if (!latestIncompleteComment) return;

      const scheduledUtc = this.ptDateTimeToUtc(
        latestIncompleteComment.scheduledDate,
        latestIncompleteComment.scheduledTime
      );
      if (isNaN(scheduledUtc.getTime())) return;

      const oneHourBefore = new Date(scheduledUtc.getTime() - 60 * 60 * 1000);
      const isUpcoming = nowUtc >= oneHourBefore && nowUtc < scheduledUtc;
      const isOverdue = nowUtc >= scheduledUtc;

      let shouldAdd = false;
      if (userRole === UserRole.ADMIN || userRole === UserRole.SUPER_ADMIN) {
        if (isOverdue) shouldAdd = true;
      } else if (userRole === UserRole.COLLECTOR || userRole === UserRole.PAYMENT_REDEEMER) {
        if (isUpcoming) shouldAdd = true;
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
          assignedPaymentRedeemer: (record as any).assignedPaymentRedeemer,
          isOverdue,
          isAssignment: false,
        });
      }
    });

    // ✅ New assignment notifications (Collectors)
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
        const assignedAt = (record as any).assignedAt;
        const assignedAtDate = assignedAt instanceof Date ? assignedAt : new Date(assignedAt);

        const hasActivity = record.comments.some((comment: any) => {
          if (!comment.createdAt) return false;
          const commentAuthorId = (comment.author as any)._id
            ? (comment.author as any)._id.toString()
            : comment.author.toString();
          if (commentAuthorId !== userId.toString()) return false;
          return new Date(comment.createdAt) > assignedAtDate;
        });

        if (hasActivity) return;

        const exists = notifications.some((n) => n.recordId.toString() === record._id.toString());
        if (exists) return;

        const assignmentExpiresAt = new Date(assignedAtDate.getTime() + 60 * 60 * 1000);
        if (nowUtc >= assignmentExpiresAt) return;

        notifications.push({
          recordId: record._id,
          ptName: record.ptName,
          text: `New record assigned: ${record.ptName}`,
          status: "Assigned",
          scheduledDate: assignedAtDate,
          scheduledTime: this.ptTimeFromDate(assignedAtDate),
          assignedCollector: record.assignedCollector,
          isAssignment: true,
          isOverdue: false,
        });
      });
    }

    // ✅ New assignment notifications (Payment Redeemer)
    if (userRole === UserRole.PAYMENT_REDEEMER && userId && Types.ObjectId.isValid(userId)) {
      const twentyFourHoursAgo = new Date(nowUtc.getTime() - 24 * 60 * 60 * 1000);

      const assignedPaymentRecords = await this.recordModel
        .find({
          assignedPaymentRedeemer: new Types.ObjectId(userId),
          paymentAssignedAt: { $gte: twentyFourHoursAgo },
          // optional safety: only WFP queue
          "comments.0.status": "wfp",
        })
        .populate("assignedPaymentRedeemer", "username")
        .populate("comments.author", "_id")
        .exec();

      assignedPaymentRecords.forEach((record) => {
        const assignedAt = (record as any).paymentAssignedAt;
        const assignedAtDate = assignedAt instanceof Date ? assignedAt : new Date(assignedAt);

        if (isNaN(assignedAtDate.getTime())) return;

        const hasActivity = record.comments.some((comment: any) => {
          if (!comment.createdAt) return false;
          const commentAuthorId = (comment.author as any)._id
            ? (comment.author as any)._id.toString()
            : comment.author.toString();
          if (commentAuthorId !== userId.toString()) return false;
          return new Date(comment.createdAt) > assignedAtDate;
        });

        if (hasActivity) return;

        const exists = notifications.some((n) => n.recordId.toString() === record._id.toString());
        if (exists) return;

        // Auto-hide after 1 hour (same as collector assignment alerts)
        const assignmentExpiresAt = new Date(assignedAtDate.getTime() + 60 * 60 * 1000);
        if (nowUtc >= assignmentExpiresAt) return;

        notifications.push({
          recordId: record._id,
          ptName: record.ptName,
          text: `New WFP assigned: ${record.ptName}`,
          status: "Assigned",
          scheduledDate: assignedAtDate,
          scheduledTime: this.ptTimeFromDate(assignedAtDate),
          assignedPaymentRedeemer: (record as any).assignedPaymentRedeemer,
          isAssignment: true,
          isOverdue: false,
        });
      });
    }

    notifications.sort((a, b) => {
      const aUtc = this.ptDateTimeToUtc(a.scheduledDate, a.scheduledTime);
      const bUtc = this.ptDateTimeToUtc(b.scheduledDate, b.scheduledTime);
      return aUtc.getTime() - bUtc.getTime();
    });

    return notifications;
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
      .populate("assignedPaymentRedeemer", "username")
      .populate("comments.author", "username")
      .exec();

    const overdueTasks: any[] = [];

    records.forEach((record) => {
      const latestIncompleteComment = record.comments
        .filter((c: any) => !c.isCompleted && c.scheduledDate)
        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

      if (!latestIncompleteComment) return;

      const eventDateObj = new Date(latestIncompleteComment.scheduledDate);
      let eventEndTime: Date;

      if (latestIncompleteComment.scheduledTime) {
        const [hours, minutes] = latestIncompleteComment.scheduledTime.split(":").map(Number);
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
          assignedPaymentRedeemer: (record as any).assignedPaymentRedeemer,
        });
      }
    });

    overdueTasks.sort((a, b) => {
      const dateAObj = new Date(a.scheduledDate);
      const [hourA, minA] = a.scheduledTime ? a.scheduledTime.split(":").map(Number) : [0, 0];
      const dateA = new Date(Date.UTC(dateAObj.getUTCFullYear(), dateAObj.getUTCMonth(), dateAObj.getUTCDate(), hourA, minA));

      const dateBObj = new Date(b.scheduledDate);
      const [hourB, minB] = b.scheduledTime ? b.scheduledTime.split(":").map(Number) : [0, 0];
      const dateB = new Date(Date.UTC(dateBObj.getUTCFullYear(), dateBObj.getUTCMonth(), dateBObj.getUTCDate(), hourB, minB));

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
      .populate("assignedPaymentRedeemer", "username")
      .populate("comments.author", "username")
      .exec();

    const events = records.map((record) => {
      const latestComment =
        record.comments && record.comments.length > 0
          ? record.comments.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
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
        assignedPaymentRedeemer: (record as any).assignedPaymentRedeemer,
        author: latestComment ? latestComment.author : null,
      };
    });

    events.sort((a, b) => new Date(a.hearingDate).getTime() - new Date(b.hearingDate).getTime());
    return events;
  }
}
