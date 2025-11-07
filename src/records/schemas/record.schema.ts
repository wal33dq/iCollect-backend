import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';

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
    enum: ['callback', 'lvm', 'spoke_to', 'sent_email_fax', 'offer', 'settle', 'wfp', 'payment_received', 'closed']
  })
  status: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  author: User;

  @Prop()
  scheduledDate: Date; // When the follow-up is scheduled

  @Prop()
  scheduledTime: string; // Time slot (15-min intervals)

  @Prop({ default: false })
  isCompleted: boolean;

  @Prop()
  completedAt: Date;
  
  createdAt: Date;
  updatedAt: Date;
}
const CommentSchema = SchemaFactory.createForClass(Comment);

@Schema({ timestamps: true })
export class Record {
  _id: Types.ObjectId;
  
  // --- NON-MODIFIABLE FIELDS/Patient Information ---

  @Prop({ required: true, index: true, immutable: true })
  provider: string;
 
  @Prop()
  renderingFacility: string;

  @Prop()
  taxId: string;

  @Prop({ required: true, index: true, immutable: true })
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

  // --- MODIFIABLE FIELDS (Billing & Insurance Information)---

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
    enum: ['yes', 'no', 'not required'],  // Fixed: Restricts to yes/no/not required
    default: 'not required',  // Default to 'not required' if not provided in XLSX
    required: false  // Make optional
  })
  ledger: string;  // Renamed to lowercase for convention

  @Prop({
    type: String,
    enum: ['yes', 'no', 'not required'],  // Fixed: Restricts to yes/no/not required
    default: 'not required',  // Default to 'not required' if not provided in XLSX
    required: false  // Make optional
  })
  hcf: string;  // Renamed to lowercase for convention

  @Prop({
    type: String,
    enum: ['yes', 'no', 'not required'],  // Fixed: Restricts to yes/no/not required
    default: 'not required',  // Default to 'not required' if not provided in XLSX
    required: false  // Make optional
  })
  invoice: string;  // Renamed to lowercase for convention

  @Prop({
    type: String,
    enum: ['yes', 'no', 'not required'],  // Fixed: Restricts to yes/no/not required
    default: 'not required',  // Default to 'not required' if not provided in XLSX
    required: false  // Make optional
  })
  signinSheet: string;  // Renamed to lowercase for convention

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
  
  @Prop()
  hearingTime: string;
  
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
  
  @Prop()
  lienStatus: string;
  
  @Prop({ 
    index: true,
    type: String,
    // MODIFIED: Added enum validation for the new dropdown values
    enum: ['SETTLED', 'C & R (GRANTED)', 'CIC PENDING', 'A & S GRANTED','ADR CASE - SETTED AND PAID ADR','ORDER OF DISMISAAL OF CASE', ''],
    required: false
  })
  caseStatus: string;
  
  @Prop()
  caseDate: Date;
  
  @Prop()
  crAmount: number;
  
  // --- COMMENTS & ASSIGNMENT ---
  @Prop({ type: [CommentSchema], default: [] })
  comments: Comment[];
  
  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  assignedCollector: User;

  @Prop({ default: Date.now, immutable: true })
  recordCreatedAt: Date;
}

export const RecordSchema = SchemaFactory.createForClass(Record);