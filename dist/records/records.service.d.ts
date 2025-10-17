import { Model } from 'mongoose';
import { Record, RecordDocument } from './schemas/record.schema';
import { CreateRecordDto } from './dto/create-record.dto';
import { UserRole } from '../users/schemas/user-role.enum';
export declare class RecordsService {
    private recordModel;
    constructor(recordModel: Model<RecordDocument>);
    create(createRecordDto: CreateRecordDto): Promise<Record>;
    processUpload(buffer: Buffer, collectorId?: string): Promise<{
        count: number;
        errors: string[];
    }>;
    findAll(collectorId?: string): Promise<Record[]>;
    findById(id: string): Promise<Record>;
    assignCollector(id: string, collectorId: string): Promise<Record>;
    update(id: string, updateData: any, user: any): Promise<Record>;
    addComment(recordId: string, commentData: {
        text: string;
        status: string;
        scheduledDate?: Date;
        scheduledTime?: string;
    }, user: any): Promise<Record>;
    updateComment(recordId: string, commentId: string, updateData: {
        isCompleted?: boolean;
    }, user: any): Promise<Record>;
    getScheduledEvents(userId?: string, startDate?: Date, endDate?: Date): Promise<any[]>;
    getNotifications(userId?: string, userRole?: UserRole): Promise<any[]>;
    getOverdueEvents(): Promise<any[]>;
    getHearingEvents(startDate?: Date, endDate?: Date): Promise<any[]>;
    deleteMany(ids: string[]): Promise<{
        deletedCount: number;
    }>;
}
