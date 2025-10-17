import { RecordsService } from './records.service';
import { CreateRecordDto } from './dto/create-record.dto';
export declare class RecordsController {
    private readonly recordsService;
    constructor(recordsService: RecordsService);
    createRecord(createRecordDto: CreateRecordDto): Promise<import("./schemas/record.schema").Record>;
    uploadFile(file: Express.Multer.File, collectorId?: string): Promise<{
        count: number;
        errors: string[];
    }>;
    getAllRecords(req: any, collectorId?: string): Promise<import("./schemas/record.schema").Record[]>;
    getHearingEvents(startDate?: string, endDate?: string): Promise<any[]>;
    getNotifications(req: any): Promise<any[]>;
    getOverdueEvents(): Promise<any[]>;
    getScheduledEvents(req: any, startDate?: string, endDate?: string): Promise<any[]>;
    getRecord(id: string, req: any): Promise<import("./schemas/record.schema").Record>;
    assignCollector(id: string, collectorId: string): Promise<import("./schemas/record.schema").Record>;
    updateRecord(id: string, updateData: any, req: any): Promise<import("./schemas/record.schema").Record>;
    addComment(id: string, commentData: {
        text: string;
        status: string;
        scheduledDate?: string;
        scheduledTime?: string;
    }, req: any): Promise<import("./schemas/record.schema").Record>;
    updateComment(id: string, commentId: string, updateData: {
        isCompleted?: boolean;
    }, req: any): Promise<import("./schemas/record.schema").Record>;
    deleteManyRecords(ids: string[]): Promise<{
        deletedCount: number;
    }>;
}
