import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  UseGuards,
  Get,
  Put,
  Param,
  Body,
  BadRequestException,
  Request,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  Query,
  Delete,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user-role.enum';
import { RecordsService } from './records.service';
import { CreateRecordDto } from './dto/create-record.dto';

@Controller('records')
@UseGuards(JwtAuthGuard)
export class RecordsController {
  constructor(private readonly recordsService: RecordsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async createRecord(@Body() createRecordDto: CreateRecordDto) {
    return this.recordsService.create(createRecordDto);
  }

  @Post('upload')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 10000000 }), // 10MB
          new FileTypeValidator({ fileType: /^(application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|text\/csv)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
    @Body('collectorId') collectorId?: string,
  ) {
    if (!file) {
      throw new BadRequestException('Make sure to upload a file');
    }
    return this.recordsService.processUpload(file.buffer, collectorId);
  }

  @Get()
  async getAllRecords(
    @Request() req, 
    @Query('collectorId') collectorId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('category') category?: string,
  ) {
    const user = req.user;
    let effectiveCollectorId = collectorId;

    // Collectors can only see their own records
    if (user.role === UserRole.COLLECTOR) {
      effectiveCollectorId = user.userId;
    }

    // Parse pagination parameters
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 25);

    return this.recordsService.findAll(
      effectiveCollectorId, 
      pageNum, 
      limitNum, 
      search, 
      category
    );
  }
  
  @Get('hearing-events')
  async getHearingEvents(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    
    return this.recordsService.getHearingEvents(start, end);
  }

  @Get('notifications')
  async getNotifications(@Request() req) {
    const user = req.user;
    // Pass user role to service, collectorId is only needed if role is COLLECTOR
    const userId = user.role === UserRole.COLLECTOR ? user.userId : undefined;
    return this.recordsService.getNotifications(userId, user.role);
  }

  @Get('overdue-events')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getOverdueEvents() {
    return this.recordsService.getOverdueEvents();
  }

  @Get('scheduled-events')
  async getScheduledEvents(
    @Request() req,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const user = req.user;
    const userId = user.role === UserRole.COLLECTOR ? user.userId : undefined;
    
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    
    return this.recordsService.getScheduledEvents(userId, start, end);
  }

  @Get(':id')
  async getRecord(@Param('id') id: string, @Request() req) {
    const record = await this.recordsService.findById(id);
    
    const user = req.user;
    // Security check: Collectors can only access their assigned records
    // or records they have commented on (for history purposes)
    if (user.role === UserRole.COLLECTOR) {
        // Check if assignedCollector is populated and matches
        const isAssigned = record.assignedCollector && 
                           typeof record.assignedCollector === 'object' && 
                           (record.assignedCollector as any)._id && 
                           (record.assignedCollector as any)._id.toString() === user.userId;

        // Check if author in comments is populated and matches
        const hasCommented = record.comments.some(
            comment => comment.author && 
                       typeof comment.author === 'object' && 
                       (comment.author as any)._id &&
                       (comment.author as any)._id.toString() === user.userId
        );

        if (!isAssigned && !hasCommented) {
            // Throw forbidden/not found, BadRequest is okay but 403/404 might be better
            throw new BadRequestException('You do not have access to this record');
        }
    }
    
    return record;
  }

  @Put('reassign-many')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async reassignMany(
    @Body('recordIds') recordIds: string[],
    @Body('collectorId') collectorId: string,
  ) {
    if (!recordIds || !Array.isArray(recordIds) || recordIds.length === 0) {
      throw new BadRequestException('recordIds must be a non-empty array.');
    }
    if (!collectorId) {
      throw new BadRequestException('collectorId is required.');
    }
    return this.recordsService.reassignMany(recordIds, collectorId);
  }

  @Put(':id/assign')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN) // Only Admin can assign/re-assign single record
  async assignCollector(
    @Param('id') id: string,
    @Body('collectorId') collectorId: string,
  ) {
    if (!collectorId) {
        throw new BadRequestException('collectorId is required.');
    }
    return this.recordsService.assignCollector(id, collectorId);
  }

  @Put(':id')
  async updateRecord(
    @Param('id') id: string,
    @Body() updateData: any,
    @Request() req,
  ) {
    // Note: Add security here if collectors should only update their own records
    return this.recordsService.update(id, updateData, req.user);
  }

  @Post(':id/comments')
  async addComment(
    @Param('id') id: string,
    @Body() commentData: {
      text: string;
      status: string;
      scheduledDate?: string; // Expecting ISO string from frontend
      scheduledTime?: string;
    },
    @Request() req,
  ) {
    const comment = {
      ...commentData,
      // Convert date string to Date object if provided
      scheduledDate: commentData.scheduledDate ? new Date(commentData.scheduledDate) : undefined,
    };
    
    return this.recordsService.addComment(id, comment, req.user);
  }

  @Put(':id/comments/:commentId')
  async updateComment(
    @Param('id') id: string,
    @Param('commentId') commentId: string,
    @Body() updateData: {
      isCompleted?: boolean;
    },
    @Request() req,
  ) {
    // Note: Add security here if collectors should only update their own comments/records
    return this.recordsService.updateComment(id, commentId, updateData, req.user);
  }

  @Delete('delete-many')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async deleteManyRecords(@Body('ids') ids: string[]) {
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException('Record IDs must be provided as an array of strings.');
    }
    return this.recordsService.deleteMany(ids);
  }
}
