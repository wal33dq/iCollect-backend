import { Document, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';
export type RecordDocument = Record & Document;
declare class MultiEntry {
    value: string;
}
declare class Comment {
    _id: Types.ObjectId;
    text: string;
    status: string;
    author: User;
    scheduledDate: Date;
    scheduledTime: string;
    isCompleted: boolean;
    completedAt: Date;
    createdAt: Date;
    updatedAt: Date;
}
export declare class Record {
    _id: Types.ObjectId;
    provider: string;
    renderingFacility: string;
    taxId: string;
    ptName: string;
    dob: Date;
    ssn: string;
    employer: string;
    insurance: string;
    bill: number;
    fds: Date;
    lds: Date;
    solDate: Date;
    claimNo: MultiEntry[];
    adjNumber: MultiEntry[];
    doi: MultiEntry[];
    hearingStatus: string;
    hearingDate: Date;
    hearingTime: string;
    judgeName: string;
    courtRoomlink: string;
    judgePhone: string;
    AccesCode: string;
    boardLocation: string;
    lienStatus: string;
    caseStatus: string;
    caseDate: Date;
    crAmount: number;
    adjuster: string;
    adjusterPhone: string;
    adjusterFax: string;
    adjusterEmail: string;
    defenseAttorney: string;
    defenseAttorneyPhone: string;
    defenseAttorneyFax: string;
    defenseAttorneyEmail: string;
    comments: Comment[];
    assignedCollector: User;
    recordCreatedAt: Date;
}
export declare const RecordSchema: import("mongoose").Schema<Record, import("mongoose").Model<Record, any, any, any, Document<unknown, any, Record, any, {}> & Record & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, Record, Document<unknown, {}, import("mongoose").FlatRecord<Record>, {}, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & import("mongoose").FlatRecord<Record> & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}>;
export {};
