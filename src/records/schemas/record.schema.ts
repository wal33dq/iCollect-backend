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
  // --- NON-MODIFIABLE FIELDS ---

  @Prop({ required: true, index: true, immutable: true })
  provider: string;
 
  @Prop({ immutable: true })
  renderingFacility: string;

  @Prop({immutable: true})
  taxId: string;

  @Prop({ required: true, index: true, immutable: true })
  ptName: string;


  @Prop({ immutable: true })
  dob: Date;

  @Prop({ immutable: true })
  ssn: string;

  @Prop({ immutable: true })
  employer: string;

  @Prop({ immutable: true })
  insurance: string;

  @Prop({ immutable: true })
  bill: number;

  @Prop({ immutable: true })
  fds: Date;

  @Prop({ immutable: true })
  lds: Date;

  @Prop({ immutable: true })
  solDate: Date;

  // --- MODIFIABLE FIELDS ---
  @Prop({ type: [MultiEntrySchema], default: [] })
  claimNo: MultiEntry[];

  @Prop({ type: [MultiEntrySchema], default: [] })
  adjNumber: MultiEntry[];

  @Prop({ type: [MultiEntrySchema], default: [] })
  doi: MultiEntry[];

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
  
  @Prop({ index: true })
  caseStatus: string;
  
  @Prop()
  caseDate: Date;
  
  @Prop()
  crAmount: number;
  
  @Prop()
  adjuster: string;
  
  @Prop()
  adjusterPhone: string;

  @Prop()
  adjusterFax: string;
  
  @Prop()
  adjusterEmail: string;

  // --- MODIFIABLE FOR FIRST 2 MONTHS ---
  @Prop()
  defenseAttorney: string;

  @Prop()
  defenseAttorneyPhone: string;
  
  @Prop()
  defenseAttorneyFax: string;
  
  @Prop()
  defenseAttorneyEmail: string;

  // --- COMMENTS & ASSIGNMENT ---
  @Prop({ type: [CommentSchema], default: [] })
  comments: Comment[];
  
  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  assignedCollector: User;

  @Prop({ default: Date.now, immutable: true })
  recordCreatedAt: Date;
}

export const RecordSchema = SchemaFactory.createForClass(Record);
