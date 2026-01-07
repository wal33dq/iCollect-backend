import { Injectable } from "@nestjs/common";
import { Record } from "./schemas/record.schema";
import { CreateRecordDto } from "./dto/create-record.dto";
import { UserRole } from "../users/schemas/user-role.enum";

import { RecordWriterService } from "./services/record-writer.service";
import { RecordsUploadService } from "./services/records-upload.service";
import { RecordsDuplicatesService } from "./services/records-duplicates.service";
import { RecordsQueryService } from "./services/records-query.service";
import { RecordsCommentsService } from "./services/records-comments.service";
import { RecordsEventsService } from "./services/records-events.service";
import { RecordsSummaryService } from "./services/records-summary.service";

@Injectable()
export class RecordsService {
  constructor(
    private readonly writer: RecordWriterService,
    private readonly upload: RecordsUploadService,
    private readonly duplicates: RecordsDuplicatesService,
    private readonly query: RecordsQueryService,
    private readonly comments: RecordsCommentsService,
    private readonly events: RecordsEventsService,
    private readonly summary: RecordsSummaryService
  ) {}

  // --- Dropdown ---
  getUniqueProviders(): Promise<string[]> {
    return this.query.getUniqueProviders();
  }

  // --- Create / Write ---
  create(createRecordDto: CreateRecordDto): Promise<Record> {
    return this.writer.create(createRecordDto);
  }

  update(id: string, updateData: any, user: any): Promise<Record> {
    return this.writer.update(id, updateData, user);
  }

  assignCollector(id: string, collectorId: string): Promise<Record> {
    return this.writer.assignCollector(id, collectorId);
  }

  reassignMany(recordIds: string[], collectorId: string): Promise<{ modifiedCount: number }> {
    return this.writer.reassignMany(recordIds, collectorId);
  }

  deleteMany(ids: string[]): Promise<{ deletedCount: number }> {
    return this.writer.deleteMany(ids);
  }

  // --- Upload ---
  processUpload(buffer: Buffer, collectorId?: string) {
    return this.upload.processUpload(buffer, collectorId);
  }

  // --- Duplicates ---
  findDuplicates(): Promise<Record[]> {
    return this.duplicates.findDuplicates();
  }

  mergeDuplicateGroup(primaryId: string, duplicateIds: string[]) {
    return this.duplicates.mergeDuplicateGroup(primaryId, duplicateIds);
  }

  mergeSelectedDuplicates(primaryId: string, duplicateIds: string[]) {
    return this.duplicates.mergeSelectedDuplicates(primaryId, duplicateIds);
  }

  // --- Queries ---
  findAll(
    user: any,
    collectorId?: string,
    page: number = 1,
    limit: number = 25,
    search?: string,
    category?: string
  ) {
    return this.query.findAll(user, collectorId, page, limit, search, category);
  }

  findById(id: string): Promise<Record> {
    return this.query.findById(id);
  }

  // --- Comments ---
  addComment(
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
    return this.comments.addComment(recordId, commentData, user);
  }

  updateComment(
    recordId: string,
    commentId: string,
    updateData: { isCompleted?: boolean },
    user: any
  ): Promise<Record> {
    return this.comments.updateComment(recordId, commentId, updateData, user);
  }

  // --- Events / Notifications ---
  getScheduledEvents(user: any, startDate?: Date, endDate?: Date): Promise<any[]> {
    return this.events.getScheduledEvents(user, startDate, endDate);
  }

  getNotifications(userId?: string, userRole?: UserRole): Promise<any[]> {
    return this.events.getNotifications(userId, userRole);
  }

  getOverdueEvents(): Promise<any[]> {
    return this.events.getOverdueEvents();
  }

  getHearingEvents(startDate?: Date, endDate?: Date): Promise<any[]> {
    return this.events.getHearingEvents(startDate, endDate);
  }

  // --- Summary ---
  getSummary(user: any): Promise<any> {
    return this.summary.getSummary(user);
  }
}
