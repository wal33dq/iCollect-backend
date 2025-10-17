import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Record, RecordDocument } from './schemas/record.schema';
import { CreateRecordDto } from './dto/create-record.dto';
import * as XLSX from 'xlsx';
import { UserRole } from '../users/schemas/user-role.enum';

@Injectable()
export class RecordsService {
  constructor(@InjectModel(Record.name) private recordModel: Model<RecordDocument>) {}

  async create(createRecordDto: CreateRecordDto): Promise<Record> {
    const payload: any = { ...createRecordDto };
    
    if (payload.assignedCollector) {
      if (!Types.ObjectId.isValid(payload.assignedCollector)) {
        throw new BadRequestException('Invalid collectorId format.');
      }
      payload.assignedCollector = new Types.ObjectId(payload.assignedCollector);
    }

    const createdRecord = new this.recordModel({
      ...payload,
      recordCreatedAt: new Date(),
    });
    return createdRecord.save();
  }

  async processUpload(buffer: Buffer, collectorId?: string): Promise<{ count: number; errors: string[] }> {
    let workbook;
    try {
      workbook = XLSX.read(buffer, { type: 'buffer' });
    } catch (err) {
      try {
        const str = buffer.toString('utf8');
        workbook = XLSX.read(str, { type: 'string' });
      } catch (err2) {
        throw new BadRequestException('Unsupported file format');
      }
    }

    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (data.length <= 1) {
      return { count: 0, errors: ['No data rows found in the sheet.'] };
    }

    const headers = data[0].map((h: string) => (h ? h.trim().replace(/\s+/g, '') : ''));
    const recordsToCreate: CreateRecordDto[] = [];
    const errors: string[] = [];

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (row.every(cell => cell === null || cell === undefined || cell === '')) continue;

      const record: any = {
        claimNo: [],
        adjNumber: [],
        doi: [],
      };

      headers.forEach((header, j) => {
        let value = row[j];
        if (value === undefined || value === '') value = null;

        const lowerHeader = header.toLowerCase();

        if (lowerHeader === 'provider') record.provider = value;
        else if (lowerHeader === 'renderingfacility') record.renderingFacility = value;
        else if (lowerHeader === 'taxid') record.taxId = value;
        else if (lowerHeader === 'ptname') record.ptName = value;
        else if (lowerHeader === 'dob') record.dob = value;
        else if (lowerHeader === 'ssnno') record.ssn = value;
        else if (lowerHeader === 'employer') record.employer = value;
        else if (lowerHeader === 'insurance') record.insurance = value;
        else if (lowerHeader === 'bill') record.bill = value ? parseFloat(value) : null;
        else if (lowerHeader === 'fds') record.fds = value;
        else if (lowerHeader === 'lds') record.lds = value;
        else if (lowerHeader === 'soldate') record.solDate = value;
        else if (lowerHeader === 'hearingstatus') record.hearingStatus = value;
        else if (lowerHeader === 'hearingdate') record.hearingDate = value;
        else if (lowerHeader === 'hearingtime') record.hearingTime = value;
        else if (lowerHeader === 'judgename') record.judgeName = value;
        else if (lowerHeader === 'courtroomlink') record.courtRoomlink = value;
        else if (lowerHeader === 'judgephone') record.judgePhone = value;
        else if (lowerHeader === 'accescode') record.AccesCode = value;
        else if (lowerHeader === 'boardlocation') record.boardLocation = value;
        else if (lowerHeader === 'lienstatus') record.lienStatus = value;
        else if (lowerHeader === 'casestatus') record.caseStatus = value;
        else if (lowerHeader === 'casedate') record.caseDate = value;
        else if (lowerHeader === 'c&ramount') record.crAmount = value ? parseFloat(value) : null;
        else if (lowerHeader === 'adjuster') record.adjuster = value;
        else if (lowerHeader === 'a-ph') record.adjusterPhone = value;
        else if (lowerHeader === 'a-fax') record.adjusterFax = value;
        else if (lowerHeader === 'a-email') record.adjusterEmail = value;
        else if (lowerHeader === 'da') record.defenseAttorney = value;
        else if (lowerHeader === 'dapho') record.defenseAttorneyPhone = value;
        else if (lowerHeader === 'dafax') record.defenseAttorneyFax = value;
        else if (lowerHeader === 'daemail') record.defenseAttorneyEmail = value;
        else if (lowerHeader.startsWith('claimno.')) {
            if (value) record.claimNo.push({ value });
        } else if (lowerHeader.startsWith('adjnumber.')) {
            if (value) record.adjNumber.push({ value });
        } else if (lowerHeader.startsWith('doi.')) {
            if (value) record.doi.push({ value });
        }
      });
      
      if (record.ptName) {
        if (collectorId) {
          record.assignedCollector = new Types.ObjectId(collectorId);
        }
        record.recordCreatedAt = new Date();
        recordsToCreate.push(record);
      } else {
        errors.push(`Row ${i + 1} skipped: missing 'ptName'.`);
      }
    }

    if (recordsToCreate.length === 0) {
        return { count: 0, errors };
    }

    try {
        // Use insertMany for bulk insertion, which is much more efficient.
        const result = await this.recordModel.insertMany(recordsToCreate, { ordered: false });
        return { count: result.length, errors };
    } catch (err) {
        // Handle potential bulk write errors, though basic errors are less likely with `ordered: false`.
        errors.push(`An error occurred during bulk insertion: ${err.message}`);
        return { count: err.insertedDocs?.length || 0, errors };
    }
  }

  async findAll(collectorId?: string): Promise<Record[]> {
    let query: any = {};
    
    if (collectorId) {
      if (collectorId === 'unassigned') {
        query = { 
          $or: [
            { assignedCollector: null },
            { assignedCollector: { $exists: false } }
          ]
        };
      } else if (Types.ObjectId.isValid(collectorId)) {
        query = { assignedCollector: new Types.ObjectId(collectorId) };
      }
    }
    
    return this.recordModel
        .find(query)
        .populate('assignedCollector', 'username')
        .populate('comments.author', 'username')
        .sort({ createdAt: -1 })
        .exec();
  }

  async findById(id: string): Promise<Record> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid record ID format.');
    }
    
    const record = await this.recordModel
        .findById(id)
        .populate('assignedCollector', 'username')
        .populate('comments.author', 'username')
        .exec();

    if (!record) {
      throw new BadRequestException('Record not found');
    }

    return record;
  }

  async assignCollector(id: string, collectorId: string): Promise<Record> {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid record ID format.');
    if (!Types.ObjectId.isValid(collectorId)) throw new BadRequestException('Invalid collectorId format.');

    const collectorObjectId = new Types.ObjectId(collectorId);

    const record = await this.recordModel
        .findByIdAndUpdate(
          id, 
          { assignedCollector: collectorObjectId }, 
          { new: true }
        )
        .populate('assignedCollector', 'username')
        .populate('comments.author', 'username')
        .exec();

    if (!record) throw new BadRequestException('Record not found');
    return record;
  }

  async update(id: string, updateData: any, user: any): Promise<Record> {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid record ID format.');

    const record = await this.recordModel
        .findByIdAndUpdate(id, updateData, { new: true })
        .populate('assignedCollector', 'username')
        .populate('comments.author', 'username')
        .exec();

    if (!record) throw new BadRequestException('Record not found');
    return record;
  }

  async addComment(
    recordId: string, 
    commentData: {
      text: string;
      status: string;
      scheduledDate?: Date;
      scheduledTime?: string;
    },
    user: any
  ): Promise<Record> {
    if (!Types.ObjectId.isValid(recordId)) {
      throw new BadRequestException('Invalid record ID format.');
    }
    if (commentData.status === 'closed' && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only administrators can close records');
    }

    await this.recordModel.updateOne(
        { _id: recordId },
        { 
            $set: { "comments.$[elem].isCompleted": true, "comments.$[elem].completedAt": new Date() }
        },
        { 
            arrayFilters: [{ "elem.isCompleted": false, "elem.scheduledDate": { $exists: true } }]
        }
    );

    const newComment = {
      _id: new Types.ObjectId(),
      text: commentData.text,
      status: commentData.status,
      author: new Types.ObjectId(user.userId),
      scheduledDate: commentData.scheduledDate,
      scheduledTime: commentData.scheduledTime,
      isCompleted: false,
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return this.recordModel
        .findByIdAndUpdate(
          recordId,
          { 
            $push: { 
              comments: {
                $each: [newComment],
                $position: 0
              }
            } 
          },
          { new: true }
        )
        .populate('assignedCollector', 'username')
        .populate('comments.author', 'username')
        .exec();
  }

  async updateComment(
    recordId: string,
    commentId: string,
    updateData: { isCompleted?: boolean; },
    user: any
  ): Promise<Record> {
    if (!Types.ObjectId.isValid(recordId)) throw new BadRequestException('Invalid record ID format.');
    if (!Types.ObjectId.isValid(commentId)) throw new BadRequestException('Invalid comment ID format.');

    const updateQuery: any = {};
    if (updateData.isCompleted !== undefined) {
      updateQuery['comments.$.isCompleted'] = updateData.isCompleted;
      updateQuery['comments.$.updatedAt'] = new Date();
      if (updateData.isCompleted) {
        updateQuery['comments.$.completedAt'] = new Date();
      }
    }

    return await this.recordModel
        .findOneAndUpdate(
          { _id: recordId, 'comments._id': commentId },
          { $set: updateQuery },
          { new: true }
        )
        .populate('assignedCollector', 'username')
        .populate('comments.author', 'username')
        .exec();
  }

  async getScheduledEvents(userId?: string, startDate?: Date, endDate?: Date): Promise<any[]> {
    const commentConditions: any = {
      scheduledDate: { $exists: true, $ne: null },
      isCompleted: false,
    };

    if (startDate && endDate) {
      commentConditions.scheduledDate = {
        ...commentConditions.scheduledDate,
        $gte: startDate,
        $lte: endDate,
      };
    }

    const query: any = {
      comments: { $elemMatch: commentConditions },
    };

    if (userId && Types.ObjectId.isValid(userId)) {
      query.assignedCollector = new Types.ObjectId(userId);
    }

    const records = await this.recordModel
      .find(query)
      .populate('assignedCollector', 'username')
      .populate('comments.author', 'username')
      .exec();

    const events = [];
    records.forEach(record => {
      const latestEventComment = record.comments
        .filter(comment => {
          if (!comment.scheduledDate || comment.isCompleted) return false;
          const eventDate = new Date(comment.scheduledDate);
          if (startDate && eventDate < startDate) return false;
          if (endDate && eventDate > endDate) return false;
          return true;
        })
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

      if (latestEventComment) {
        events.push({
          recordId: record._id,
          commentId: latestEventComment._id,
          ptName: record.ptName,
          text: latestEventComment.text,
          status: latestEventComment.status,
          scheduledDate: latestEventComment.scheduledDate,
          scheduledTime: latestEventComment.scheduledTime,
          author: latestEventComment.author,
          assignedCollector: record.assignedCollector,
          createdAt: latestEventComment.createdAt,
        });
      }
    });
    
    events.sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime());
    return events;
  }

  async getNotifications(userId?: string, userRole?: UserRole): Promise<any[]> {
    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

    const matchConditions: any = {
        "comments.isCompleted": false,
        "comments.scheduledTime": { $exists: true, $ne: null },
        "comments.scheduledDate": { $exists: true, $ne: null },
    };

    if (userId && Types.ObjectId.isValid(userId)) {
        matchConditions.assignedCollector = new Types.ObjectId(userId);
    }
    
    const records = await this.recordModel.find(matchConditions)
        .populate('assignedCollector', 'username')
        .populate('comments.author', 'username')
        .exec();

    const notifications = [];
    records.forEach(record => {
        const latestIncompleteComment = record.comments
            .filter(c => !c.isCompleted && c.scheduledDate && c.scheduledTime)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

        if (!latestIncompleteComment) return;
        
        try {
            const dateFromDb = new Date(latestIncompleteComment.scheduledDate);
            const [hour, minute] = latestIncompleteComment.scheduledTime.split(':').map(Number);
            
            const scheduledDateTime = new Date(
                dateFromDb.getUTCFullYear(),
                dateFromDb.getUTCMonth(),
                dateFromDb.getUTCDate(),
                hour,
                minute
            );

            if (isNaN(scheduledDateTime.getTime())) return;
            
            const eventEndTime = new Date(scheduledDateTime.getTime() + 15 * 60 * 1000);

            const isOverdue = now > eventEndTime;
            const isUpcoming = scheduledDateTime > now && scheduledDateTime <= oneHourFromNow;
            const isActive = scheduledDateTime <= now && now <= eventEndTime;

            let shouldAdd = false;
            if (userRole === UserRole.ADMIN || userRole === UserRole.SUPER_ADMIN) {
                if (isOverdue) {
                    shouldAdd = true;
                }
            } else if (userRole === UserRole.COLLECTOR) {
                if (isUpcoming || isActive) {
                    shouldAdd = true;
                }
            }

            if (shouldAdd) {
                notifications.push({
                    recordId: record._id,
                    commentId: latestIncompleteComment._id,
                    ptName: record.ptName,
                    text: latestIncompleteComment.text,
                    status: latestIncompleteComment.status,
                    scheduledDate: latestIncompleteComment.scheduledDate,
                    scheduledTime: latestIncompleteComment.scheduledTime,
                    author: latestIncompleteComment.author,
                    assignedCollector: record.assignedCollector,
                    isOverdue: isOverdue,
                });
            }
        } catch (e) {
            console.error("Error processing notification for record:", record._id, e);
        }
    });
    
    notifications.sort((a, b) => {
        const dateAObj = new Date(a.scheduledDate);
        const [hourA, minA] = a.scheduledTime.split(':').map(Number);
        const dateA = new Date(dateAObj.getUTCFullYear(), dateAObj.getUTCMonth(), dateAObj.getUTCDate(), hourA, minA);

        const dateBObj = new Date(b.scheduledDate);
        const [hourB, minB] = b.scheduledTime.split(':').map(Number);
        const dateB = new Date(dateBObj.getUTCFullYear(), dateBObj.getUTCMonth(), dateBObj.getUTCDate(), hourB, minB);
        return dateA.getTime() - dateB.getTime();
    });

    return notifications;
  }

  async getOverdueEvents(): Promise<any[]> {
    const now = new Date();

    const records = await this.recordModel.find({
      comments: {
        $elemMatch: {
          isCompleted: false,
          scheduledDate: { $exists: true, $ne: null }
        }
      }
    })
    .populate('assignedCollector', 'username')
    .populate('comments.author', 'username')
    .exec();

    const overdueTasks = [];

    records.forEach(record => {
      try {
        const latestIncompleteComment = record.comments
            .filter(c => !c.isCompleted && c.scheduledDate)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

        if (!latestIncompleteComment) return;

        const eventDateObj = new Date(latestIncompleteComment.scheduledDate);
        let eventEndTime;

        if (latestIncompleteComment.scheduledTime) {
            const [hours, minutes] = latestIncompleteComment.scheduledTime.split(':').map(Number);
            const eventStartTime = new Date(
                eventDateObj.getUTCFullYear(),
                eventDateObj.getUTCMonth(),
                eventDateObj.getUTCDate(),
                hours,
                minutes
            );
            eventEndTime = new Date(eventStartTime.getTime() + 15 * 60 * 1000);
        } else {
            eventEndTime = new Date(
                eventDateObj.getUTCFullYear(),
                eventDateObj.getUTCMonth(),
                eventDateObj.getUTCDate(),
                23, 59, 59, 999
            );
        }
        
        if (now > eventEndTime) {
            overdueTasks.push({
                recordId: record._id,
                commentId: latestIncompleteComment._id,
                ptName: record.ptName,
                text: latestIncompleteComment.text,
                scheduledDate: latestIncompleteComment.scheduledDate,
                scheduledTime: latestIncompleteComment.scheduledTime,
                author: latestIncompleteComment.author,
                assignedCollector: record.assignedCollector,
            });
        }
      } catch (e) {
        console.error(`Failed to process overdue event for record ${record._id}:`, e);
      }
    });
    
    overdueTasks.sort((a, b) => {
        const dateAObj = new Date(a.scheduledDate);
        const [hourA, minA] = a.scheduledTime ? a.scheduledTime.split(':').map(Number) : [0, 0];
        const dateA = new Date(Date.UTC(dateAObj.getUTCFullYear(), dateAObj.getUTCMonth(), dateAObj.getUTCDate(), hourA, minA));

        const dateBObj = new Date(b.scheduledDate);
        const [hourB, minB] = b.scheduledTime ? b.scheduledTime.split(':').map(Number) : [0, 0];
        const dateB = new Date(Date.UTC(dateBObj.getUTCFullYear(), dateBObj.getUTCMonth(), dateBObj.getUTCDate(), hourB, minB));

        return dateA.getTime() - dateB.getTime();
    });

    return overdueTasks;
  }
  
  async getHearingEvents(startDate?: Date, endDate?: Date): Promise<any[]> {
    const query: any = {
      hearingDate: { $exists: true, $ne: null },
    };

    if (startDate && endDate) {
      query.hearingDate = {
        $gte: startDate,
        $lte: endDate,
      };
    }

    const records = await this.recordModel
      .find(query)
      .populate('assignedCollector', 'username')
      .exec();

    const events = records.map(record => ({
      recordId: record._id,
      ptName: record.ptName,
      hearingStatus: record.hearingStatus,
      hearingDate: record.hearingDate,
      hearingTime: record.hearingTime,
      judgeName: record.judgeName,
      courtRoomlink: record.courtRoomlink,
      judgePhone: record.judgePhone,
      AccesCode: record.AccesCode,
      boardLocation: record.boardLocation,
      assignedCollector: record.assignedCollector,
    }));
    
    events.sort((a, b) => new Date(a.hearingDate).getTime() - new Date(b.hearingDate).getTime());
    return events;
  }

  async deleteMany(ids: string[]): Promise<{ deletedCount: number }> {
    const validIds = ids.filter(id => Types.ObjectId.isValid(id)).map(id => new Types.ObjectId(id));
    
    if (validIds.length !== ids.length) {
      throw new BadRequestException('One or more invalid record IDs were provided.');
    }

    const result = await this.recordModel.deleteMany({
      _id: { $in: validIds }
    });

    return { deletedCount: result.deletedCount };
  }
}
