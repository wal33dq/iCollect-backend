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

    // Calculate outstanding if bill and paid are provided
    if (payload.bill !== undefined && payload.paid !== undefined) {
      payload.outstanding = payload.bill - payload.paid;
    } else if (payload.bill !== undefined) {
      // If only bill is provided, outstanding is the same as bill (assuming paid is 0)
      payload.outstanding = payload.bill;
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

    if (data.length === 0) {
      return { count: 0, errors: ['No data found in the sheet.'] };
    }

    const headers = data[0].map((h: string) => (h ? h.trim().replace(/\s+/g, '') : ''));

    const records: CreateRecordDto[] = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (row.length === 0) continue;

      const record: any = {
        claimNo: [],
        adjNumber: [],
        doi: [],
      };

      for (let j = 0; j < headers.length; j++) {
        let value = row[j];
        if (value === undefined || value === '') value = null;

        const header = headers[j].toLowerCase();

        if (header === 'provider') record.provider = value;
        else if (header === 'renderingfacility') record.renderingFacility = value;
        else if (header === 'taxid') record.taxId = value;
        else if (header === 'ptname') record.ptName = value;
        else if (header === 'dob') record.dob = value;
        else if (header === 'ssnno') record.ssn = value;
        else if (header === 'employer') record.employer = value;
        else if (header === 'insurance') record.insurance = value;
        else if (header === 'bill') record.bill = value ? parseFloat(value) : null;
        // --- Updated Fields Start ---
        else if (header === 'paid') record.paid = value ? parseFloat(value) : null;
        else if (header === 'outstanding') record.outstanding = value ? parseFloat(value) : null;
        // --- Updated Fields End ---
        else if (header === 'fds') record.fds = value;
        else if (header === 'lds') record.lds = value;
        else if (header === 'ledger') record.ledger = value;
        // --- Updated Fields Start ---
        else if (header === 'hcf') record.hcf = value;
        else if (header === 'invoice') record.invoice = value;
        else if (header === 'signinsheet') record.signinSheet = value;
        // --- Updated Fields End ---
        else if (header === 'soldate') record.solDate = value;
        else if (header === 'hearingstatus') record.hearingStatus = value;
        else if (header === 'hearingdate') record.hearingDate = value;
        else if (header === 'hearingtime') record.hearingTime = value;
        else if (header === 'judgename') record.judgeName = value;
        else if (header === 'courtroomlink') record.courtRoomlink = value;
        else if (header === 'judgephone') record.judgePhone = value;
        else if (header === 'accescode') record.AccesCode = value;
        else if (header === 'boardlocation') record.boardLocation = value;
        else if (header === 'lienstatus') record.lienStatus = value;
        else if (header === 'casestatus') record.caseStatus = value;
        else if (header === 'casedate') record.caseDate = value;
        else if (header === 'c&ramount') record.crAmount = value ? parseFloat(value) : null;
        else if (header === 'adjuster') record.adjuster = value;
        else if (header === 'a-ph') record.adjusterPhone = value;
        else if (header === 'a-fax') record.adjusterFax = value;
        else if (header === 'a-email') record.adjusterEmail = value;
        else if (header === 'da') record.defenseAttorney = value;
        else if (header === 'dapho') record.defenseAttorneyPhone = value;
        else if (header === 'dafax') record.defenseAttorneyFax = value;
        else if (header === 'daemail') record.defenseAttorneyEmail = value;
        else if (header.startsWith('claimno.')) {
          const index = parseInt(header.split('.')[1]) - 1;
          if (value) record.claimNo[index] = { value };
        } else if (header.startsWith('adjnumber.')) {
          const index = parseInt(header.split('.')[1]) - 1;
          if (value) record.adjNumber[index] = { value };
        } else if (header.startsWith('doi.')) {
          const index = parseInt(header.split('.')[1]) - 1;
          if (value) record.doi[index] = { value };
        }
      }

      record.claimNo = record.claimNo.filter(item => item !== undefined);
      record.adjNumber = record.adjNumber.filter(item => item !== undefined);
      record.doi = record.doi.filter(item => item !== undefined);

      // Calculate outstanding if not provided but bill/paid are
      if (record.outstanding === undefined || record.outstanding === null) {
        if (record.bill !== undefined && record.paid !== undefined && record.bill !== null && record.paid !== null) {
            record.outstanding = record.bill - record.paid;
        } else if (record.bill !== undefined && record.bill !== null) {
            record.outstanding = record.bill; // Assume paid is 0
        }
      }

      // Upload record if patient name exists, regardless of the bill amount.
      if (record.ptName) {
        if (collectorId) {
          record.assignedCollector = collectorId;
        }
        records.push(record);
      }
    }

    let count = 0;
    const errors: string[] = [];

    for (const rec of records) {
      try {
        await this.create(rec);
        count++;
      } catch (err) {
        errors.push(`Error creating record for ${rec.ptName}: ${err.message}`);
      }
    }

    return { count, errors };
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

  async reassignMany(recordIds: string[], collectorId: string): Promise<{ modifiedCount: number }> {
    if (!Types.ObjectId.isValid(collectorId)) {
      throw new BadRequestException('Invalid collectorId format.');
    }
    const validRecordIds = recordIds
      .filter(id => Types.ObjectId.isValid(id))
      .map(id => new Types.ObjectId(id));
    
    if (validRecordIds.length !== recordIds.length) {
      throw new BadRequestException('One or more invalid record IDs provided.');
    }

    const collectorObjectId = new Types.ObjectId(collectorId);

    const result = await this.recordModel.updateMany(
      { _id: { $in: validRecordIds } },
      { $set: { assignedCollector: collectorObjectId } }
    );

    return { modifiedCount: result.modifiedCount };
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

    // Recalculate outstanding amount if bill or paid is being updated
    if (updateData.bill !== undefined || updateData.paid !== undefined) {
        const record = await this.recordModel.findById(id);
        if (!record) throw new BadRequestException('Record not found');

        const newBill = updateData.bill !== undefined ? updateData.bill : record.bill;
        const newPaid = updateData.paid !== undefined ? updateData.paid : record.paid;

        if (newBill !== undefined && newPaid !== undefined && newBill !== null && newPaid !== null) {
            updateData.outstanding = newBill - newPaid;
        } else if (newBill !== undefined && newBill !== null) {
            updateData.outstanding = newBill; // Assume paid is 0 if not set
        }
    }


    const updatedRecord = await this.recordModel
        .findByIdAndUpdate(id, updateData, { new: true })
        .populate('assignedCollector', 'username')
        .populate('comments.author', 'username')
        .exec();

    if (!updatedRecord) throw new BadRequestException('Record not found');
    return updatedRecord;
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
