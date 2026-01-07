import { Injectable, BadRequestException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { Record, RecordDocument } from "../schemas/record.schema";

@Injectable()
export class RecordsDuplicatesService {
  constructor(
    @InjectModel(Record.name) private readonly recordModel: Model<RecordDocument>
  ) {}

  /**
   * Finds duplicate records based on Provider, PT Name, and Adj Number.
   */
  async findDuplicates(): Promise<Record[]> {
    const duplicates = await this.recordModel.aggregate([
      {
        $match: {
          provider: { $exists: true, $ne: "" },
          ptName: { $exists: true, $ne: "" },
          "adjNumber.0": { $exists: true },
        },
      },
      { $unwind: "$adjNumber" },
      {
        $group: {
          _id: {
            provider: { $toLower: "$provider" },
            ptName: { $toLower: "$ptName" },
            adjNumber: "$adjNumber.value",
          },
          uniqueIds: { $addToSet: "$_id" },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ]);

    const duplicateIds = duplicates.reduce((acc: any[], curr: any) => {
      return acc.concat(curr.uniqueIds);
    }, []);

    if (duplicateIds.length === 0) return [];

    return this.recordModel
      .find({ _id: { $in: duplicateIds } })
      .populate("assignedCollector", "username")
      .populate("comments.author", "username")
      .sort({ provider: 1, ptName: 1 })
      .exec();
  }

  async mergeDuplicateGroup(primaryId: string, duplicateIds: string[]) {
    if (!Types.ObjectId.isValid(primaryId)) {
      throw new BadRequestException("Invalid primaryId.");
    }

    if (!Array.isArray(duplicateIds) || duplicateIds.length === 0) {
      throw new BadRequestException("duplicateIds must be a non-empty array.");
    }

    const cleanDupIds = [...new Set(duplicateIds)].filter((id) => id !== primaryId);

    if (cleanDupIds.length === 0) {
      throw new BadRequestException("Please select at least one duplicate record to merge.");
    }

    for (const id of cleanDupIds) {
      if (!Types.ObjectId.isValid(id)) {
        throw new BadRequestException(`Invalid duplicateId: ${id}`);
      }
    }

    const ids = [primaryId, ...cleanDupIds].map((id) => new Types.ObjectId(id));

    const docs = await this.recordModel.find({ _id: { $in: ids } }).lean();

    const primary = docs.find((d: any) => d._id.toString() === primaryId);
    if (!primary) throw new BadRequestException("Primary record not found.");

    const duplicates = docs.filter((d: any) => d._id.toString() !== primaryId);

    if (duplicates.length !== cleanDupIds.length) {
      throw new BadRequestException("One or more duplicate records were not found.");
    }

    // Safety check: ensure same provider + ptName, and share at least one ADJ number with primary.
    const norm = (s: any) => String(s || "").trim().toLowerCase();
    const providerNorm = norm(primary.provider);
    const ptNorm = norm(primary.ptName);
    const primaryAdj = new Set(
      (primary.adjNumber || []).map((a: any) => String(a?.value || "").trim())
    );

    for (const dup of duplicates) {
      if (norm(dup.provider) !== providerNorm || norm(dup.ptName) !== ptNorm) {
        throw new BadRequestException(
          "Selected records do not match the same Provider and Patient Name."
        );
      }

      const dupAdj = new Set(
        (dup.adjNumber || []).map((a: any) => String(a?.value || "").trim())
      );

      const hasCommonAdj = [...dupAdj].some((v) => primaryAdj.has(v));
      if (!hasCommonAdj) {
        throw new BadRequestException(
          "Selected records do not share a common ADJ Number with the primary record."
        );
      }
    }

    const existingMergedKeys = new Set(
      (primary.comments || [])
        .filter((c: any) => c?.sourceRecordId && c?.sourceCommentId)
        .map((c: any) => `${String(c.sourceRecordId)}::${String(c.sourceCommentId)}`)
    );

    const now = new Date();
    const commentsToInsert: any[] = [];

    const toAuthorId = (a: any) => {
      if (!a) return a;
      if (typeof a === "string") return new Types.ObjectId(a);
      if (a?._id) return new Types.ObjectId(String(a._id));
      return a;
    };

    const snapshot = (r: any) => ({
      recordId: String(r._id),
      provider: r.provider,
      ptName: r.ptName,
      adjNumbers: (r.adjNumber || []).map((x: any) => x?.value).filter(Boolean),
      recordCreatedAt: r.recordCreatedAt || r.createdAt || null,
      assignedCollector: r.assignedCollector
        ? {
            _id: r.assignedCollector?._id
              ? String(r.assignedCollector._id)
              : String(r.assignedCollector),
            username: r.assignedCollector?.username,
          }
        : null,
    });

    for (const dup of duplicates) {
      for (const c of dup.comments || []) {
        const key = `${String(dup._id)}::${String(c._id)}`;
        if (existingMergedKeys.has(key)) continue;

        const createdAt = c.createdAt ? new Date(c.createdAt) : now;
        const updatedAt = c.updatedAt ? new Date(c.updatedAt) : createdAt;

        commentsToInsert.push({
          _id: new Types.ObjectId(),
          text: c.text,
          status: c.status,
          author: toAuthorId(c.author),
          scheduledDate: c.scheduledDate || null,
          scheduledTime: c.scheduledTime || null,
          offerAmount: c.offerAmount ?? null,
          isCompleted: Boolean(c.isCompleted),
          completedAt: c.completedAt || null,
          createdAt,
          updatedAt,
          isFromMergedRecord: true,
          sourceRecordId: new Types.ObjectId(String(dup._id)),
          sourceCommentId: c._id ? new Types.ObjectId(String(c._id)) : null,
          sourceRecordSnapshot: snapshot(dup),
          mergedAt: now,
        });
      }
    }

    if (commentsToInsert.length === 0) {
      const delRes = await this.recordModel.deleteMany({
        _id: { $in: cleanDupIds.map((id) => new Types.ObjectId(id)) },
      });

      return {
        primaryId,
        mergedCommentsInserted: 0,
        duplicatesDeleted: delRes.deletedCount || 0,
      };
    }

    await this.recordModel.updateOne(
      { _id: new Types.ObjectId(primaryId) },
      {
        $push: {
          comments: {
            $each: commentsToInsert,
            $sort: { createdAt: 1 },
          },
        },
      },
      { runValidators: true }
    );

    const delRes = await this.recordModel.deleteMany({
      _id: { $in: cleanDupIds.map((id) => new Types.ObjectId(id)) },
    });

    return {
      primaryId,
      mergedCommentsInserted: commentsToInsert.length,
      duplicatesDeleted: delRes.deletedCount || 0,
    };
  }

  async mergeSelectedDuplicates(primaryId: string, duplicateIds: string[]) {
    if (!Types.ObjectId.isValid(primaryId)) {
      throw new BadRequestException("Invalid primaryId");
    }

    if (!Array.isArray(duplicateIds) || duplicateIds.length === 0) {
      throw new BadRequestException("duplicateIds must be a non-empty array");
    }

    if (duplicateIds.includes(primaryId)) {
      throw new BadRequestException("primaryId must not be included in duplicateIds");
    }

    const invalid = duplicateIds.find((id) => !Types.ObjectId.isValid(id));
    if (invalid) {
      throw new BadRequestException(`Invalid duplicateId: ${invalid}`);
    }

    const allIds = [primaryId, ...duplicateIds].map((id) => new Types.ObjectId(id));

    const docs = await this.recordModel
      .find({ _id: { $in: allIds } })
      .select({
        comments: 1,
        provider: 1,
        ptName: 1,
        adjNumber: 1,
        assignedCollector: 1,
        recordCreatedAt: 1,
        createdAt: 1,
      })
      .populate("assignedCollector", "username")
      .lean()
      .exec();

    const primary = docs.find((d: any) => String(d._id) === String(primaryId));
    if (!primary) {
      throw new BadRequestException("Primary record not found");
    }

    const duplicates = docs.filter((d: any) => duplicateIds.includes(String(d._id)));

    if (duplicates.length !== duplicateIds.length) {
      const found = new Set(docs.map((d: any) => String(d._id)));
      const missing = duplicateIds.filter((id) => !found.has(String(id)));

      throw new BadRequestException(
        `Some duplicate records were not found: ${missing.join(", ")}`
      );
    }

    // Safety check
    const norm = (s: any) => String(s || "").trim().toLowerCase();
    const primaryProvider = norm(primary.provider);
    const primaryPtName = norm(primary.ptName);
    const primaryAdj = new Set((primary.adjNumber || []).map((a: any) => norm(a?.value)));

    for (const d of duplicates) {
      if (norm(d.provider) !== primaryProvider || norm(d.ptName) !== primaryPtName) {
        throw new BadRequestException(
          "Selected records do not match (provider/patient). Please only merge true duplicates from the same group."
        );
      }

      const dupAdj = (d.adjNumber || []).map((a: any) => norm(a?.value));
      const intersects = dupAdj.some((v: string) => primaryAdj.has(v));
      if (primaryAdj.size > 0 && !intersects) {
        throw new BadRequestException(
          "Selected records do not share an ADJ number. Please only merge records that are true duplicates."
        );
      }
    }

    const existingMergedKeys = new Set(
      (primary.comments || [])
        .filter(
          (c: any) => c?.isFromMergedRecord && c?.sourceRecordId && c?.sourceCommentId
        )
        .map((c: any) => `${String(c.sourceRecordId)}:${String(c.sourceCommentId)}`)
    );

    const now = new Date();
    const commentsToInsert: any[] = [];

    const snapshotFor = (rec: any) => {
      const assigned = rec.assignedCollector;

      return {
        provider: rec.provider,
        ptName: rec.ptName,
        adjNumbers: (rec.adjNumber || []).map((a: any) => a?.value).filter(Boolean),
        recordCreatedAt: rec.recordCreatedAt || rec.createdAt || null,
        assignedCollector: assigned
          ? {
              _id: assigned?._id ? String(assigned._id) : String(assigned),
              username: assigned?.username,
            }
          : null,
      };
    };

    for (const dup of duplicates) {
      const srcSnapshot = snapshotFor(dup);

      for (const c of dup.comments || []) {
        const srcRecordId = String(dup._id);
        const srcCommentId = c?._id ? String(c._id) : "";
        const key = `${srcRecordId}:${srcCommentId}`;

        if (srcCommentId && existingMergedKeys.has(key)) continue;

        const author =
          (c as any).author &&
          typeof (c as any).author === "object" &&
          (c as any).author._id
            ? (c as any).author._id
            : (c as any).author;

        const createdAt = (c as any).createdAt ? new Date((c as any).createdAt) : now;
        const updatedAt = (c as any).updatedAt ? new Date((c as any).updatedAt) : createdAt;

        commentsToInsert.push({
          _id: new Types.ObjectId(),
          text: (c as any).text,
          status: (c as any).status,
          author,
          scheduledDate: (c as any).scheduledDate || null,
          scheduledTime: (c as any).scheduledTime || null,
          offerAmount: (c as any).offerAmount,
          isCompleted: (c as any).isCompleted || false,
          completedAt: (c as any).completedAt || null,
          createdAt,
          updatedAt,
          isFromMergedRecord: true,
          sourceRecordId: new Types.ObjectId(srcRecordId),
          sourceCommentId: srcCommentId ? new Types.ObjectId(srcCommentId) : undefined,
          sourceRecordSnapshot: srcSnapshot,
          mergedAt: now,
        });
      }
    }

    if (commentsToInsert.length > 0) {
      await this.recordModel.updateOne(
        { _id: new Types.ObjectId(primaryId) },
        {
          $push: {
            comments: {
              $each: commentsToInsert,
              $sort: { createdAt: 1 },
            },
          },
        },
        { runValidators: true }
      );
    }

    const deleteRes = await this.recordModel.deleteMany({
      _id: { $in: duplicateIds.map((id) => new Types.ObjectId(id)) },
    });

    return {
      primaryId,
      mergedRecords: duplicateIds.length,
      mergedComments: commentsToInsert.length,
      deletedDuplicates: deleteRes.deletedCount || 0,
    };
  }
}
