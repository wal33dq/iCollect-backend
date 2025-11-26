import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Record, RecordDocument } from './schemas/record.schema'; 
import { CreateRecordDto } from './dto/create-record.dto';
import * as XLSX from 'xlsx';
import { UserRole } from '../users/schemas/user-role.enum';
import { stat } from 'fs';

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
     // ADDED: Set assignedAt when creating with a collector
      payload.assignedAt = new Date();

    }
    
    if (payload.bill !== undefined && payload.paid !== undefined && payload.bill !== null && payload.paid !== null) {
      payload.outstanding = payload.bill - payload.paid;
    } else if (payload.bill !== undefined && payload.bill !== null) {
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
    
    const data: any[][] = XLSX.utils.sheet_to_json(sheet, { 
      header: 1, 
      raw: false,    
      defval: null   
    });

    if (data.length === 0) {
      return { count: 0, errors: ['No data found in the sheet.'] };
    }
    
    const parseCurrency = (value: any): number | null => {
      if (value === null || value === undefined || value === '') return null;
      if (typeof value === 'number') return value; 
      let cleanStr = String(value);
      const isNegativeInParens = cleanStr.startsWith('(') && cleanStr.endsWith(')');
      cleanStr = cleanStr.replace(/[$,€£¥\s()]/g, '');
      const num = parseFloat(cleanStr);
      if (isNaN(num)) return null; 
      return isNegativeInParens ? -num : num;
    };

    const normalizeCaseStatus = (value: any): string => {
        if (typeof value !== 'string' || !value) return ''; 
        const allowed = ['SETTLED', 'C & R (GRANTED)', 'CIC PENDING', 'A & S GRANTED', 'ADR CASE - SETTED AND PAID ADR', 'ORDER OF DISMISAAL OF CASE', ''];
        if (allowed.includes(value.trim())) return value.trim();
        return value; 
    };


    const headers = data[0].map((h: string) => (h ? h.trim().replace(/\s+/g, '') : ''));

    const records: CreateRecordDto[] = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (row.length === 0) continue;

      const record: any = { claimNo: [], adjNumber: [], doi: [], };

      for (let j = 0; j < headers.length; j++) {
        let value = row[j];
        if (value === null) continue; 

        const header = headers[j].toLowerCase();

        if (header === 'provider') record.provider = value;
        else if (header === 'renderingfacility') record.renderingFacility = value;
        else if (header === 'taxid') record.taxId = value;
        else if (header === 'ptname') record.ptName = value;
        else if (header === 'dob') record.dob = value; 
        else if (header === 'ssn') record.ssn = value; 
        else if (header === 'employer') record.employer = value;
        else if (header === 'insurance') record.insurance = value;
        else if (header === 'bill') record.bill = parseCurrency(value);
        else if (header === 'paid') record.paid = parseCurrency(value);
        else if (header === 'outstanding') record.outstanding = parseCurrency(value);
        else if (header === 'fds') record.fds = value; 
        else if (header === 'lds') record.lds = value; 
        else if (header === 'ledger') record.ledger = value;
        else if (header === 'hcf') record.hcf = value;
        else if (header === 'invoice') record.invoice = value;
        else if (header === 'signinsheet') record.signinSheet = value;
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
        else if (header === 'casestatus') record.caseStatus = normalizeCaseStatus(value); 
        else if (header === 'casedate') record.caseDate = value; 
        else if (header === 'cramount') record.crAmount = parseCurrency(value); 
        else if (header === 'dorfiledby') record.dorFiledBy = value;
        else if (header === 'status4903_8') record.status4903_8 = value;
        else if (header === 'pmrstatus') record.pmrStatus = value;
        else if (header === 'judgeorderstatus') record.judgeOrderStatus = value;
        else if (header === 'adjuster') record.adjuster = value;
        else if (header === 'adjusterphone') record.adjusterPhone = value;
        else if (header === 'adjusterfax') record.adjusterFax = value;
        else if (header === 'adjusteremail') record.adjusterEmail = value;
        else if (header === 'defenseattorney') record.defenseAttorney = value; 
        else if (header === 'defenseattorneyphone') record.defenseAttorneyPhone = value; 
        else if (header === 'defenseattorneyfax') record.defenseAttorneyFax = value; 
        else if (header === 'defenseattorneyemail') record.defenseAttorneyEmail = value; 
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

      if (record.outstanding === undefined || record.outstanding === null) {
        if (record.bill !== undefined && record.paid !== undefined && record.bill !== null && record.paid !== null) {
            record.outstanding = record.bill - record.paid;
        } else if (record.bill !== undefined && record.bill !== null) {
            record.outstanding = record.bill; 
        }
      }

      if (record.ptName) {
        if (collectorId) {
          record.assignedCollector = collectorId;
          // ADDED: Set assignedAt when uploading with assignment
          record.assignedAt = new Date();
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

  /**
   * [NEW] Finds duplicate records based on Provider, PT Name, and Adj Number.
  * Logic:
  * 1. Unwinds adjNumber (to handle array).
  * 2. Groups by Provider (lower), PtName (lower), and AdjNumber.
  * 3. Filters groups with count > 1.
  * 4. Returns the full list of records that are part of these duplicate groups.*/
  async findDuplicates(): Promise<Record[]> {
  const duplicates = await this.recordModel.aggregate([
   // 1. Filter out records that don't have the required fields to avoid null grouping
      {
        $match: {
          provider: { $exists: true, $ne: '' },
          ptName: { $exists: true, $ne: '' },
         'adjNumber.0': { $exists: true }, // Ensure at least one adjNumber exists
        },
      },
      // 2. Unwind adjNumber array so we can match individual values
      { $unwind: '$adjNumber' },
      // 3. Group by the key criteria
      {
        $group: {
          _id: {
            provider: { $toLower: '$provider' },
            ptName: { $toLower: '$ptName' },
            adjNumber: '$adjNumber.value',
          },
          uniqueIds: { $addToSet: '$_id' }, // Collect unique Record IDs in this group
          count: { $sum: 1 },
        },
      },
      // 4. Filter for groups that have more than 1 record (actual duplicates)
      {
        $match: {
          count: { $gt: 1 },
        },
      },
    ]);
    // 5. Extract all IDs from the duplicate groups
    // The 'duplicates' array contains objects with 'uniqueIds' arrays. We need to flatten this.
    const duplicateIds = duplicates.reduce((acc, curr) => {
        return acc.concat(curr.uniqueIds);
    }, []);
    // 6. Fetch the full documents using standard Mongoose find to allow Population
    // We use distinct IDs in case a record was flagged as duplicate for multiple reasons
    if (duplicateIds.length === 0) {
        return [];
    }
    return this.recordModel
      .find({ _id: { $in: duplicateIds } })
      .populate('assignedCollector', 'username')
      .populate('comments.author', 'username')
      .sort({ provider: 1, ptName: 1 }) // Sort to keep duplicates near each other visually
      .exec();
  }
  async findAll(
    user: any, 
    collectorId?: string,
    page: number = 1,
    limit: number = 25,
    search?: string,
    category?: string,
  ): Promise<{ data: any[]; total: number; page: number; limit: number }> {
    
    const skip = (page - 1) * limit;
    const baseQuery: any = {};
    let collectorObjectId: Types.ObjectId | null = null;

    // [UPDATED] Filter by Provider Role (Case Insensitive + Whitespace Tolerant + Username Fallback)
    if (user.role === UserRole.PROVIDER) {
        // Use Full Name, fallback to Username if empty
        const providerName = (user.fullName || user.username || '').trim();
        
        if (!providerName) {
            return { data: [], total: 0, page, limit };
        }

        const escapedName = providerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Regex to match name with optional surrounding spaces, case insensitive
        // Example: User "mmck" matches DB "MMCK", " MMCK ", "mmck"
        baseQuery.provider = { $regex: new RegExp(`^\\s*${escapedName}\\s*$`, 'i') };
    }

    // Filter by Collector
    if (collectorId) {
      if (collectorId === 'unassigned') {
        baseQuery.$or = [
            { assignedCollector: null },
            { assignedCollector: { $exists: false } }
          ];
      } else if (Types.ObjectId.isValid(collectorId)) {
        collectorObjectId = new Types.ObjectId(collectorId);
        baseQuery.assignedCollector = collectorObjectId;
      } else if (user.role === UserRole.COLLECTOR) {
         collectorObjectId = new Types.ObjectId(user.userId);
         baseQuery.assignedCollector = collectorObjectId;
      }
    } else if (user.role === UserRole.COLLECTOR) {
         collectorObjectId = new Types.ObjectId(user.userId);
         baseQuery.assignedCollector = collectorObjectId;
    }
    
    // Search
    if (search) {
      const searchRegex = new RegExp(search, 'i'); 
      const searchConditions = [
        { provider: searchRegex },
        { ptName: searchRegex },
        { 'adjNumber.value': searchRegex },
        { lienStatus: searchRegex },
        { caseStatus: searchRegex },
        { 'comments.status': searchRegex }, 
      ];
      
      if (baseQuery.$or) {
          baseQuery.$and = [
              { $or: baseQuery.$or },
              { $or: searchConditions }
          ];
          delete baseQuery.$or; 
      } else {
          baseQuery.$or = searchConditions;
      }
    }

    if (category === 'history' && collectorObjectId) {
      baseQuery['comments.author'] = collectorObjectId;
    } else if (category === 'active' && collectorObjectId) {
      baseQuery['comments.author'] = { $ne: collectorObjectId };
    }

    const total = await this.recordModel.countDocuments(baseQuery);
    
    const data = await this.recordModel
        .find(baseQuery)
        .populate('assignedCollector', 'username')
        .populate('comments.author', 'username')
        .sort({ createdAt: -1 }) 
        .skip(skip)
        .limit(limit)
        .exec();

    const processedData = data.map(doc => {
        const record = doc.toObject() as Record & { lastCommentDate?: Date | null }; 
        
        if (category === 'history' && collectorObjectId) {
            const userComments = record.comments
                .filter(c => {
                    if (!c.author) return false;
                    const authorId = (c.author as any)._id ? (c.author as any)._id.toString() : c.author.toString();
                    return authorId === collectorObjectId.toString();
                })
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()); 
            
            if (userComments.length > 0) {
                record.lastCommentDate = userComments[0].createdAt;
            } else {
                record.lastCommentDate = null;
            }
        }
        
        return record;
    });

    return { data: processedData, total, page, limit };
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
    let collectorValue: Types.ObjectId | null = null;

    if (collectorId === 'unassigned') {
      collectorValue = null;
    } else if (Types.ObjectId.isValid(collectorId)) {
      collectorValue = new Types.ObjectId(collectorId);
    } else {
      throw new BadRequestException('Invalid collectorId format.');
    }

    const validRecordIds = recordIds
      .filter(id => Types.ObjectId.isValid(id))
      .map(id => new Types.ObjectId(id));
    
    if (validRecordIds.length !== recordIds.length) {
      throw new BadRequestException('One or more invalid record IDs provided.');
    }

    const result = await this.recordModel.updateMany(
      { _id: { $in: validRecordIds } },
       // ADDED: Update assignedAt

      { $set: { assignedCollector: collectorValue, assignedAt: new Date() } }
    );

    return { modifiedCount: result.modifiedCount };
  }

  async assignCollector(id: string, collectorId: string): Promise<Record> {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid record ID format.');
    
    let collectorValue: Types.ObjectId | null = null;
    
    if (collectorId === 'unassigned') {
      collectorValue = null;
    } else if (Types.ObjectId.isValid(collectorId)) {
      collectorValue = new Types.ObjectId(collectorId);
    } else {
      throw new BadRequestException('Invalid collectorId format.');
    }

    const record = await this.recordModel
        .findByIdAndUpdate(
          id, 
           // ADDED: Update assignedAt
          { assignedCollector: collectorValue, assignedAt: new Date() }, 
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

    if (updateData.bill !== undefined || updateData.paid !== undefined) {
        const record = await this.recordModel.findById(id);
        if (!record) throw new BadRequestException('Record not found');

        const newBill = updateData.bill !== undefined ? updateData.bill : record.bill;
        const newPaid = updateData.paid !== undefined ? updateData.paid : record.paid;

        if (newBill !== undefined && newPaid !== undefined && newBill !== null && newPaid !== null) {
            updateData.outstanding = newBill - newPaid;
        } else if (newBill !== undefined && newBill !== null) {
            updateData.outstanding = newBill; 
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
      offerAmount?: number; // <--- TYPE DEFINITION
    },
    user: any
  ): Promise<Record> {
    if (!Types.ObjectId.isValid(recordId)) {
      throw new BadRequestException('Invalid record ID format.');
    }
    
    if ((commentData.status === 'closed' || commentData.status === 'payment_received') && 
        (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN)) {
      throw new ForbiddenException('Only administrators or super admins can use this status.');
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
      offerAmount: commentData.offerAmount,
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
          offerAmount: latestEventComment.offerAmount,
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
                    isAssignment: false // Flag as task
                });
            }
        } catch (e) {
            console.error("Error processing notification for record:", record._id, e);
        }
    });
    // --- 2. New Assignment Notifications (NEW LOGIC) ---
   // Only fetch assignments for collectors, not admins
    if (userRole === UserRole.COLLECTOR && userId && Types.ObjectId.isValid(userId)) {
        const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const assignedRecords = await this.recordModel.find({
            assignedCollector: new Types.ObjectId(userId),
            assignedAt: { $gte: twentyFourHoursAgo } // Assigned in last 24 hours
        })
        .populate('assignedCollector', 'username')
        .populate('comments.author', '_id') // Populate author ID to check if collector commented
        .exec();
        assignedRecords.forEach(record => {
            // Check if the collector has already "touched" this record (added a comment)
           // AFTER the assignment time.
            const hasActivity = record.comments.some(comment => {
                // Ensure comment exists and has creation date
                if (!comment.createdAt) return false;
                // Check if comment is by the current collector
                const commentAuthorId = (comment.author as any)._id
                    ? (comment.author as any)._id.toString()
                    : comment.author.toString();
                if (commentAuthorId !== userId.toString()) return false;
               // Check if comment was made AFTER the assignment time
               // This implies the collector started working on it
               return new Date(comment.createdAt) > new Date(record.assignedAt);
            });
            // If there is activity, DO NOT show the notification (return early from this iteration)
            if (hasActivity) return;
            // Avoid duplicate notifications if the record already has a task in the list
            // (Optional: remove this check if you want both notification types to show)
            const exists = notifications.some(n => n.recordId.toString() === record._id.toString());
            if (!exists) {
                notifications.push({
                    recordId: record._id,
                    ptName: record.ptName,
                    text: `New record assigned: ${record.ptName}`,
                    status: 'Assigned',
                    scheduledDate: record.assignedAt,
                    scheduledTime: 'Now', // Formatting for frontend
                    assignedCollector: record.assignedCollector,
                    isAssignment: true, // Flag as assignment
                    isOverdue: false
                });
            }
        });
    }

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
      provider: record.provider,
      ptName: record.ptName,
      adjNumber: record.adjNumber,
      caseStatus: record.caseStatus,
      hearingStatus: record.hearingStatus,
      hearingDate: record.hearingDate,
      hearingTime: record.hearingTime,
      judgeName: record.judgeName,
      courtRoomlink: record.courtRoomlink,
      judgePhone: record.judgePhone,
      AccesCode: record.AccesCode,
      boardLocation: record.boardLocation,
      pmrStatus: record.pmrStatus,
      dorFiledBy: record.dorFiledBy,
      status4903_8: record.status4903_8,
      judgeOrderStatus: record.judgeOrderStatus,
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
    
  async getSummary(user: any): Promise<any> { 
    
    const aggregationPipeline: any[] = [];

    if (user.role === UserRole.COLLECTOR) {
      if (!user.userId || !Types.ObjectId.isValid(user.userId)) {
        return []; 
      }
      aggregationPipeline.push({
        $match: {
          assignedCollector: new Types.ObjectId(user.userId)
        }
      });
    }
    // [UPDATED] Filter summary for Providers with whitespace tolerance
    else if (user.role === UserRole.PROVIDER) {
        const providerName = (user.fullName || user.username || '').trim();
        if (!providerName) return [];

        const escapedName = providerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        aggregationPipeline.push({
            $match: {
                provider: { $regex: new RegExp(`^\\s*${escapedName}\\s*$`, 'i') }
            }
        });
    }

    aggregationPipeline.push({
      $facet: {
        byCaseStatus: [
          {
            $match: {
              provider: { $exists: true, $nin: [null, ""] },
              caseStatus: { $exists: true, $nin: [null, ""] }
            }
          },
          {
            $project: {
              provider: "$provider",
              standardizedStatus: {
                $switch: {
                  branches: [
                    {
                      case: { $regexMatch: { input: "$caseStatus", regex: /c ?& ?r.*granted/i } },
                      then: "C & R (GRANTED)"
                    },
                    {
                      case: { $regexMatch: { input: "$caseStatus", regex: /cic.*pend/i } },
                      then: "CIC PENDING"
                    },
                    {
                      case: { $regexMatch: { input: "$caseStatus", regex: /settled/i } },
                      then: "SETTLED"
                    }
                  ],
                  default: { // MODIFIED: Check for the specific values, case-insensitive

                      $cond: [

                        { $regexMatch: { input: "$caseStatus", regex: /settled/i } },

                        "SETTLED",

                        "OTHER" // Default for non-matching

                      ]

                  }
                }
              }
            }
          },
          {
            $group: {
              _id: {
                provider: "$provider",
                status: "$standardizedStatus"
              },
              count: { $sum: 1 }
            }
          },
          {
            $project: {
              _id: 0,
              provider: "$_id.provider",
              status: "$_id.status",
              count: "$count"
            }
          }
        ],
        byCommentStatus: [
          {
            $match: {
              provider: { $exists: true, $nin: [null, ""] },
              "comments.status": { $regex: /^out of sol$/i }
            }
          },
          {
            $group: {
              _id: "$provider",
              count: { $sum: 1 }
            }
          },
          {
            $project: {
              _id: 0,
              provider: "$_id",
              status: "OUT OF SOL", 
              count: "$count"
            }
          }
        ]
      }
    });

    aggregationPipeline.push(
      {
        $project: {
          allStatuses: { $concatArrays: ["$byCaseStatus", "$byCommentStatus"] }
        }
      },
      {
        $unwind: "$allStatuses"
      },
      {
         $match: {
          "allStatuses.status": { 
            $in: [
              "C & R (GRANTED)", 
              "CIC PENDING", 
              "SETTLED", 
              "OUT OF SOL"
            ] 
          }
        }
      },
      {
        $group: {
          _id: "$allStatuses.provider",
          statuses: {
            $push: {
              status: "$allStatuses.status",
              count: "$allStatuses.count"
            }
          },
          totalCount: { $sum: "$allStatuses.count" }
        }
      },
      {
        $project: {
          _id: 0,
          provider: "$_id",
          statuses: 1,
          totalCount: 1
        }
      },
      {
        $sort: {
          provider: 1
        }
      }
    );

    const facetStage = aggregationPipeline.find(stage => stage.$facet);
    if (facetStage) {
        const projectStage = facetStage.$facet.byCaseStatus.find(stage => stage.$project);
        if (projectStage) {
            projectStage.$project.standardizedStatus = {
                $switch: {
                  branches: [
                    {
                      case: { $regexMatch: { input: "$caseStatus", regex: /c ?& ?r.*granted/i } },
                      then: "C & R (GRANTED)"
                    },
                    {
                      case: { $regexMatch: { input: "$caseStatus", regex: /cic.*pend/i } },
                      then: "CIC PENDING"
                    },
                    {
                      case: { $regexMatch: { input: "$caseStatus", regex: /settled/i } },
                      then: "SETTLED"
                    }
                  ],
                  default: "OTHER" 
                }
            };
        }
    }

    return this.recordModel.aggregate(aggregationPipeline);
  }
}