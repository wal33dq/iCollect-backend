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
    const andFilters: any[] = [];
    let collectorObjectId: Types.ObjectId | null = null;

    const isCollectorUser = user.role === UserRole.COLLECTOR;
    const isPaymentRedeemerUser = user.role === UserRole.PAYMENT_REDEEMER;

    // Provider Role filter (Case Insensitive + Whitespace tolerant)
    if (user.role === UserRole.PROVIDER) {
      const providerName = (user.fullName || user.username || "").trim();
      if (!providerName) return { data: [], total: 0, page, limit };

      const escapedName = providerName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      andFilters.push({
        provider: { $regex: new RegExp(`^\\s*${escapedName}\\s*$`, "i") },
      });
    }

    // --- Collector filter ---
    // IMPORTANT: Collectors should NEVER be allowed to query other collectors' records.
    // Payment Redeemers should NEVER query collector-based views.
    const effectiveCollectorId = isCollectorUser
      ? user.userId
      : isPaymentRedeemerUser
      ? undefined
      : collectorId;

    if (effectiveCollectorId) {
      if (effectiveCollectorId === "unassigned") {
        // Only allow unassigned for Admin/Super Admin/Provider, not collectors.
        if (isCollectorUser) {
          throw new BadRequestException("Collectors cannot view unassigned records.");
        }
        andFilters.push({
          $or: [
            { assignedCollector: null },
            { assignedCollector: { $exists: false } },
          ],
        });
      } else {
        if (!Types.ObjectId.isValid(effectiveCollectorId)) {
          throw new BadRequestException("Invalid collectorId format.");
        }

        collectorObjectId = new Types.ObjectId(effectiveCollectorId);
        const idStr = collectorObjectId.toString();

        // Backward-compatible match:
        // ✅ Normal docs: assignedCollector: ObjectId(...)
        // ⚠️ Legacy docs: assignedCollector: { _id: ObjectId(...) OR "...", username: "..." }
        // ⚠️ Extra safety: assignedCollector: "..." (string)
        andFilters.push({
          $or: [
            { assignedCollector: collectorObjectId },
            { assignedCollector: idStr },
            { "assignedCollector._id": collectorObjectId },
            { "assignedCollector._id": idStr },
          ],
        });
      }
    } else if (isCollectorUser) {
      // Collector without explicit collectorId (should not happen, but keep safe)
      if (!Types.ObjectId.isValid(user.userId)) {
        throw new BadRequestException("Invalid collector userId in token.");
      }

      collectorObjectId = new Types.ObjectId(user.userId);
      const idStr = collectorObjectId.toString();

      andFilters.push({
        $or: [
          { assignedCollector: collectorObjectId },
          { assignedCollector: idStr },
          { "assignedCollector._id": collectorObjectId },
          { "assignedCollector._id": idStr },
        ],
      });
    }

    // --- Payment Redeemer filter ---
    // Payment Redeemer should only see records assigned to them.
    if (isPaymentRedeemerUser) {
      if (!Types.ObjectId.isValid(user.userId)) {
        throw new BadRequestException(
          "Invalid payment redeemer userId in token."
        );
      }

      const redeemerObjectId = new Types.ObjectId(user.userId);
      const idStr = redeemerObjectId.toString();

      // Backward-compatible match (similar to collector matching)
      andFilters.push({
        $or: [
          { assignedPaymentRedeemer: redeemerObjectId },
          { assignedPaymentRedeemer: idStr },
          { "assignedPaymentRedeemer._id": redeemerObjectId },
          { "assignedPaymentRedeemer._id": idStr },
        ],
      });

      // Default behavior: Payment Redeemer queue is "Waiting For Payment" records.
      // (Your comments are pushed at index 0, so comments.0 is the latest comment.)
      andFilters.push({
        "comments.0.status": "wfp",
        "comments.0.isCompleted": false,
      });
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
      andFilters.push({ $or: searchConditions });
    }

    // Category filtering for collector dashboard
    if (collectorObjectId) {
      const idStr = collectorObjectId.toString();

      if (category === "history") {
        // Match both comment-author shapes
        andFilters.push({
          $or: [
            { "comments.author": collectorObjectId },
            { "comments.author": idStr },
            { "comments.author._id": collectorObjectId },
            { "comments.author._id": idStr },
          ],
        });
      } else if (category === "active") {
        // Active = assigned to collector but NO comments by them
        andFilters.push({
          $nor: [
            { "comments.author": collectorObjectId },
            { "comments.author": idStr },
            { "comments.author._id": collectorObjectId },
            { "comments.author._id": idStr },
          ],
        });
      }
    }

    const baseQuery = andFilters.length > 0 ? { $and: andFilters } : {};

    const total = await this.recordModel.countDocuments(baseQuery);

    const data = await this.recordModel
      .find(baseQuery)
      .populate("assignedCollector", "username")
      .populate("assignedPaymentRedeemer", "username")
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

        record.lastCommentDate =
          userComments.length > 0 ? userComments[0].createdAt : null;
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
      .populate("assignedPaymentRedeemer", "username")
      .populate("comments.author", "username")
      .exec();

    if (!record) throw new BadRequestException("Record not found");
    return record;
  }

  async getAssignmentSummary(startDate?: Date, endDate?: Date): Promise<any[]> {
    const match: any = {};

    if (startDate || endDate) {
      const range: any = {};
      if (startDate) range.$gte = startDate;
      if (endDate) range.$lte = endDate;
      match.$or = [{ assignedAt: range }, { "assignmentHistory.assignedAt": range }];
    }

    const records = await this.recordModel
      .find(match)
      .populate("assignedCollector", "username fullName")
      .populate("assignedBy", "username fullName")
      .populate("assignmentHistory.fromCollector", "username fullName")
      .populate("assignmentHistory.toCollector", "username fullName")
      .populate("assignmentHistory.assignedBy", "username fullName")
      .exec();

    const formatUser = (user: any) => {
      if (!user) return null;
      const id = user._id ? user._id.toString() : user.toString();
      return {
        id,
        username: user.username,
        fullName: user.fullName,
      };
    };

    return records.map((record) => ({
      recordId: record._id.toString(),
      provider: record.provider || null,
      ptName: record.ptName || null,
      adjNumber: Array.isArray(record.adjNumber)
        ? record.adjNumber.map((a: any) => a?.value).filter(Boolean)
        : [],
      assignedCollector: formatUser(record.assignedCollector),
      assignedBy: formatUser(record.assignedBy),
      assignedAt: record.assignedAt,
      assignmentHistory: (record.assignmentHistory || []).map((entry: any) => ({
        fromCollector: formatUser(entry.fromCollector),
        toCollector: formatUser(entry.toCollector),
        assignedBy: formatUser(entry.assignedBy),
        assignedAt: entry.assignedAt,
      })),
    }));
  }
}
