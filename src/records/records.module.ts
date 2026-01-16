import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";

import { RecordsController } from "./records.controller";
import { RecordsService } from "./records.service";
import { Record, RecordSchema } from "./schemas/record.schema";

import { RecordWriterService } from "./services/record-writer.service";
import { RecordsUploadService } from "./services/records-upload.service";
import { RecordsDuplicatesService } from "./services/records-duplicates.service";
import { RecordsQueryService } from "./services/records-query.service";
import { RecordsCommentsService } from "./services/records-comments.service";
import { RecordsEventsService } from "./services/records-events.service";
import { RecordsSummaryService } from "./services/records-summary.service";

import { UsersModule } from "../users/users.module";

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Record.name, schema: RecordSchema }]),
    UsersModule,
  ],
  controllers: [RecordsController],
  providers: [
    RecordsService,
    RecordWriterService,
    RecordsUploadService,
    RecordsDuplicatesService,
    RecordsQueryService,
    RecordsCommentsService,
    RecordsEventsService,
    RecordsSummaryService,
  ],
  exports: [RecordsQueryService, RecordsCommentsService, RecordsEventsService],
})
export class RecordsModule {}
