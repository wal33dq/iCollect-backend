import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";
import { User } from "../../users/schemas/user.schema";

export type RecordDocument = Record & Document;

// Schema for fields that can have multiple entries
@Schema({ _id: false })
class MultiEntry {
  @Prop()
  value: string;
}
const MultiEntrySchema = SchemaFactory.createForClass(MultiEntry);

// Schema for the comments field with status and schedule
@Schema({ timestamps: true })
class Comment {
  _id: Types.ObjectId;

  @Prop({ required: true })
  text: string;

  @Prop({
    required: true,
    enum: [
      "callback",
      "lvm",
      "spoke_to",
      "sent_email_fax",
      "offer",
      "settle",
      "request_to_close",
      "wfp",
      "payment_received",
      "closed",
      "file_pmr",
      "file_lien",
      "hearing_remarks",
    ],
  })
  status: string;

  @Prop({ type: Types.ObjectId, ref: "User", required: true })
  author: User;

  @Prop()
  scheduledDate: Date; // When the follow-up is scheduled

  @Prop()
  scheduledTime: string;

  // --- NEW FIELD ---
  @Prop()
  offerAmount: number;
  // ----------------

  // ---------------- MERGE METADATA (for duplicate merge) ----------------

  // True if this comment originally lived on another (duplicate) record.

  @Prop({ default: false })
  isFromMergedRecord: boolean;

  // The record this comment originally came from.

  @Prop({ type: Types.ObjectId })
  sourceRecordId: Types.ObjectId;

  // The original comment id on the source record.

  @Prop({ type: Types.ObjectId })
  sourceCommentId: Types.ObjectId;

  // Small snapshot so UI can display "Merged from ..." without extra fetches.

  @Prop({ type: Object })
  sourceRecordSnapshot: any;

  // When this comment was merged.

  @Prop()
  mergedAt: Date;

  // ----------------------------------------------------------------------
  @Prop({ default: false })
  isCompleted: boolean;

  @Prop()
  completedAt: Date;

  createdAt: Date;
  updatedAt: Date;
}
const CommentSchema = SchemaFactory.createForClass(Comment);

@Schema({ _id: false })
class AssignmentHistoryEntry {
  @Prop({ type: Types.ObjectId, ref: "User" })
  fromCollector: User;

  @Prop({ type: Types.ObjectId, ref: "User" })
  toCollector: User;

  @Prop({ type: Types.ObjectId, ref: "User" })
  assignedBy: User;

  @Prop()
  assignedAt: Date;
}
const AssignmentHistoryEntrySchema = SchemaFactory.createForClass(
  AssignmentHistoryEntry
);

@Schema({ timestamps: true })
export class Record {
  _id: Types.ObjectId;

  // --- NEW: Reference ID Field (ADDED) ---
  @Prop({
    unique: true,
    index: true,
    sparse: true, // Allows older records to temporarily exist without ID during migration
    immutable: true,
  })
  referenceId: string;
  // ---------------------------------------

  // ---MODIFIABLE FIELDS/Patient Information ---

  @Prop({ required: true, index: true })
  provider: string;

  @Prop()
  renderingFacility: string;

  @Prop()
  taxId: string;

  @Prop({ required: true, index: true })
  ptName: string;

  @Prop()
  dob: Date;

  @Prop()
  ssn: string;

  @Prop()
  employer: string;

  @Prop({ type: [MultiEntrySchema], default: [] })
  doi: MultiEntry[];

  @Prop({ type: [MultiEntrySchema], default: [] })
  adjNumber: MultiEntry[];

  @Prop()
  bill: number;

  @Prop()
  paid: number;

  @Prop()
  outstanding: number;

  @Prop()
  fds: Date;

  @Prop()
  lds: Date;

  @Prop()
  solDate: Date;

  @Prop({
    type: String,
    enum: ["yes", "no", "not required"], // Fixed: Restricts to yes/no/not required
    default: "not required", // Default to 'not required' if not provided in XLSX
    required: false, // Make optional
  })
  ledger: string; // Renamed to lowercase for convention

  @Prop({
    type: String,
    enum: ["yes", "no", "not required"], // Fixed: Restricts to yes/no/not required
    default: "not required", // Default to 'not required' if not provided in XLSX
    required: false, // Make optional
  })
  hcf: string; // Renamed to lowercase for convention

  @Prop({
    type: String,
    enum: ["yes", "no", "not required"], // Fixed: Restricts to yes/no/not required
    default: "not required", // Default to 'not required' if not provided in XLSX
    required: false, // Make optional
  })
  invoice: string; // Renamed to lowercase for convention

  @Prop({
    type: String,
    enum: ["yes", "no", "not required"], // Fixed: Restricts to yes/no/not required
    default: "not required", // Default to 'not required' if not provided in XLSX
    required: false, // Make optional
  })
  signinSheet: string; // Renamed to lowercase for convention

  @Prop()
  insurance: string;

  @Prop({ type: [MultiEntrySchema], default: [] })
  claimNo: MultiEntry[];

  @Prop()
  adjuster: string;

  @Prop()
  adjusterPhone: string;

  @Prop()
  adjusterFax: string;

  @Prop()
  adjusterEmail: string;

  @Prop()
  defenseAttorney: string;

  @Prop()
  defenseAttorneyPhone: string;

  @Prop()
  defenseAttorneyFax: string;

  @Prop()
  defenseAttorneyEmail: string;

  //Case & Hearing Information(Exam Status)

  @Prop()
  hearingStatus: string;

  @Prop()
  hearingDate: Date;

  @Prop({
    type: String,
    enum: ["AM", "PM"],
    default: null,
  })
  hearingTime?: string;

  @Prop()
  judgeName: string;

  @Prop()
  courtRoomlink: string;

  @Prop()
  judgePhone: string;

  @Prop()
  AccesCode: string;

  @Prop()
  boardLocation: string;

  @Prop({
    index: true,
    type: String,
    enum: ["Not Filed", "Out of SOL", "Filed", "Settled", ""],
    required: false,
  })
  lienStatus: string;

  @Prop({
    index: true,
    type: String,
    // MODIFIED: Added enum validation for the new dropdown values
    enum: [
      "SETTLED",
      "C & R (GRANTED)",
      "CIC PENDING",
      "A & S GRANTED",
      "ADR CASE - SETTED AND PAID ADR",
      "ORDER OF DISMISAAL OF CASE",
      "",
    ],
    required: false,
  })
  caseStatus: string;

  @Prop()
  caseDate: Date;

  @Prop()
  crAmount: number;

  @Prop({
    type: String,
    enum: ["HUBUR", "CLIENT", "ANOTHER LIEN CLAIMANT"],
    default: null,
  })
  dorFiledBy?: string;

  @Prop({
    type: String,
    enum: ["yes", "no"],
    default: null,
  })
  status4903_8?: string;

  @Prop({
    type: String,
    enum: ["yes", "no"],
    default: null,
  })
  pmrStatus?: string;

  @Prop({
    type: String,
    enum: ["GRANTED", "PENDING"],
    default: null,
  })
  judgeOrderStatus?: string;

  // --- COMMENTS & ASSIGNMENT ---
  @Prop({ type: [CommentSchema], default: [] })
  comments: Comment[];

  @Prop({ type: Types.ObjectId, ref: "User", index: true })
  assignedCollector: User;

  // NEW: Track when the record was assigned to the current collector
  @Prop({ default: Date.now })
  assignedAt: Date;

  @Prop({ type: Types.ObjectId, ref: "User" })
  assignedBy: User;

  @Prop({ type: [AssignmentHistoryEntrySchema], default: [] })
  assignmentHistory: AssignmentHistoryEntry[];

  @Prop({ default: Date.now, immutable: true })
  recordCreatedAt: Date;
}

export const RecordSchema = SchemaFactory.createForClass(Record);
