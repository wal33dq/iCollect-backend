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
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { UserRole } from "../users/schemas/user-role.enum";
import { RecordsService } from "./records.service";
import { CreateRecordDto } from "./dto/create-record.dto";
import { DateTime } from "luxon";

@Controller("records")
@UseGuards(JwtAuthGuard)
export class RecordsController {
  private readonly logger = new Logger(RecordsController.name);

  constructor(private readonly recordsService: RecordsService) {}

  // --- NEW ENDPOINT ADDED HERE ---
  @Get("unique-providers")
  async getUniqueProviders() {
    const providers = await this.recordsService.getUniqueProviders();
    return { data: providers };
  }
  // -------------------------------

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async createRecord(@Body() createRecordDto: CreateRecordDto, @Request() req) {
    return this.recordsService.create(createRecordDto, req.user);
  }

  @Post("upload")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor("file"))
  async uploadFile(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 10000000 }), // 10MB
          new FileTypeValidator({
            fileType:
              /^(application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|text\/csv)$/,
          }),
        ],
      })
    )
    file: Express.Multer.File,
    @Request() req,
    @Body("collectorId") collectorId?: string
  ) {
    if (!file) {
      throw new BadRequestException("Make sure to upload a file");
    }
    return this.recordsService.processUpload(file.buffer, collectorId, req.user);
  }

  @Get()
  async getAllRecords(
    @Request() req,
    @Query("collectorId") collectorId?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("search") search?: string,
    @Query("category") category?: string
  ) {
    const user = req.user;

    // Parse pagination parameters
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 25);

    // Pass the entire user object to the service for strict filtering
    return this.recordsService.findAll(
      user,
      collectorId,
      pageNum,
      limitNum,
      search,
      category
    );
  }

  @Get("summary")
  @UseGuards(RolesGuard)
  @Roles(
    UserRole.ADMIN,
    UserRole.SUPER_ADMIN,
    UserRole.COLLECTOR,
    UserRole.PROVIDER
  )
  async getSummary(@Request() req) {
    return this.recordsService.getSummary(req.user);
  }

  @Get("hearing-events")
  async getHearingEvents(
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    return this.recordsService.getHearingEvents(start, end);
  }

  @Get("notifications")
  async getNotifications(@Request() req) {
    const user = req.user;
    const userId = user.role === UserRole.COLLECTOR ? user.userId : undefined;
    return this.recordsService.getNotifications(userId, user.role);
  }

  @Get("overdue-events")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getOverdueEvents() {
    return this.recordsService.getOverdueEvents();
  }

  // --- UPDATED: Pass full user object to allow Provider filtering ---
  @Get("scheduled-events")
  async getScheduledEvents(
    @Request() req,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string
  ) {
    const user = req.user;
    // We pass the whole 'user' object now, so the service can check roles and names
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    return this.recordsService.getScheduledEvents(user, start, end);
  }

  // For Duplicate Files
  @Get("duplicates")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getDuplicates() {
    return this.recordsService.findDuplicates();
  }
  /**
   * Merge only the duplicates the user selected.
   *
   * ✅ Merge multiple duplicates into one primary record
   * ✅ Preserve ALL comments and keep author + timestamps
   * ✅ Tag merged comments with source record information
   * ✅ Auto-delete duplicates after merge
   */
  @Post("duplicates/merge-group")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async mergeSelectedDuplicateGroup(
    @Body() body: { primaryId: string; duplicateIds: string[] }
  ) {
    const { primaryId, duplicateIds } = body || ({} as any);
    if (
      !primaryId ||
      !Array.isArray(duplicateIds) ||
      duplicateIds.length === 0
    ) {
      throw new BadRequestException(
        "primaryId and duplicateIds[] are required"
      );
    }
    return this.recordsService.mergeSelectedDuplicates(primaryId, duplicateIds);
  }

  @Get("assignments/summary")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getAssignmentSummary(
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    if (startDate && isNaN(start.getTime())) {
      throw new BadRequestException("Invalid startDate.");
    }
    if (endDate && isNaN(end.getTime())) {
      throw new BadRequestException("Invalid endDate.");
    }

    return this.recordsService.getAssignmentSummary(start, end);
  }

  @Get(":id")
  async getRecord(@Param("id") id: string, @Request() req) {
    const record = await this.recordsService.findById(id);
    const user = req.user;

    // Security check: Collectors
    if (user.role === UserRole.COLLECTOR) {
      const isAssigned =
        record.assignedCollector &&
        typeof record.assignedCollector === "object" &&
        (record.assignedCollector as any)._id &&
        (record.assignedCollector as any)._id.toString() === user.userId;

      const hasCommented = record.comments.some(
        (comment) =>
          comment.author &&
          typeof comment.author === "object" &&
          (comment.author as any)._id &&
          (comment.author as any)._id.toString() === user.userId
      );

      if (!isAssigned && !hasCommented) {
        throw new BadRequestException("You do not have access to this record");
      }
    }

    // [UPDATED] Security check: Providers (Regex for Case-Insensitive + Whitespace Tolerance)
    if (user.role === UserRole.PROVIDER) {
      const userIdentifier = (user.fullName || user.username || "").trim();
      const recordProvider = record.provider ? record.provider.trim() : "";

      // If the user has no name in the token/profile, deny access immediately
      if (!userIdentifier) {
        this.logger.error(
          `Provider access denied: User ${user.username} has no fullName or username`
        );
        throw new ForbiddenException(
          "Your account profile is incomplete. Access Denied."
        );
      }

      // Use Regex to match the provider name (handles "NAME", "name", " Name ")
      const escapedName = userIdentifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const providerRegex = new RegExp(`^\\s*${escapedName}\\s*$`, "i");

      if (!providerRegex.test(recordProvider)) {
        throw new ForbiddenException(
          `Access Denied: This record belongs to ${record.provider}.`
        );
      }
    }

    return record;
  }

  @Put("reassign-many")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async reassignMany(
    @Body("recordIds") recordIds: string[],
    @Body("collectorId") collectorId: string,
    @Request() req
  ) {
    if (!recordIds || !Array.isArray(recordIds) || recordIds.length === 0) {
      throw new BadRequestException("recordIds must be a non-empty array.");
    }
    if (!collectorId) {
      throw new BadRequestException("collectorId is required.");
    }
    return this.recordsService.reassignMany(recordIds, collectorId, req.user);
  }

  @Put(":id/assign")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.PROVIDER)
  async assignCollector(
    @Param("id") id: string,
    @Body("collectorId") collectorId: string,
    @Request() req
  ) {
    const user = req.user;

    // [STRICT + ROBUST] Security check for assignment by Provider
    if (user.role === UserRole.PROVIDER) {
      const record = await this.recordsService.findById(id);
      const userIdentifier = (user.fullName || user.username || "")
        .trim()
        .toLowerCase();
      const recordProvider = record.provider
        ? record.provider.trim().toLowerCase()
        : "";

      // If the user has no name in the token/profile, deny access immediately
      if (!userIdentifier) {
        throw new ForbiddenException(
          "Your account profile is incomplete. Access Denied."
        );
      }

      // Strict comparison - Provider can only assign their own records
      if (recordProvider !== userIdentifier) {
        throw new ForbiddenException(
          `Access Denied: You can only assign records belonging to ${record.provider}.`
        );
      }
    }

    if (!collectorId) {
      throw new BadRequestException("collectorId is required.");
    }
    return this.recordsService.assignCollector(id, collectorId, req.user);
  }


  @Put(":id")
  async updateRecord(
    @Param("id") id: string,
    @Body() updateData: any,
    @Request() req
  ) {
    const user = req.user;

    // [STRICT + ROBUST] Security check for updates by Provider
    if (user.role === UserRole.PROVIDER) {
      const record = await this.recordsService.findById(id);
      const userIdentifier = (user.fullName || user.username || "")
        .trim()
        .toLowerCase();
      const recordProvider = record.provider
        ? record.provider.trim().toLowerCase()
        : "";

      if (!userIdentifier || recordProvider !== userIdentifier) {
        throw new ForbiddenException(
          "You do not have permission to update this record."
        );
      }
    }

    return this.recordsService.update(id, updateData, req.user);
  }

  @Post(":id/comments")
  async addComment(
    @Param("id") id: string,
    @Body()
    commentData: {
      text: string;
      status: string;
      scheduledDate?: string;
      scheduledTime?: string;
      offerAmount?: number; // <--- NEW FIELD ACCEPTED HERE
    },
    @Request() req
  ) {
    const user = req.user;

    // [STRICT + ROBUST] Security check for comments by Provider
    if (user.role === UserRole.PROVIDER) {
      const record = await this.recordsService.findById(id);
      const userIdentifier = (user.fullName || user.username || "")
        .trim()
        .toLowerCase();
      const recordProvider = record.provider
        ? record.provider.trim().toLowerCase()
        : "";

      if (!userIdentifier || recordProvider !== userIdentifier) {
        throw new ForbiddenException(
          "You do not have permission to comment on this record."
        );
      }
    }

    const comment = {
      ...commentData,
      scheduledDate: commentData.scheduledDate
        ? DateTime.fromISO(String(commentData.scheduledDate).slice(0, 10), {
            zone: "America/Los_Angeles",
          })
            .startOf("day")
            .toUTC()
            .toJSDate()
        : undefined,
    };

    return this.recordsService.addComment(id, comment, req.user);
  }

  @Put(":id/comments/:commentId")
  async updateComment(
    @Param("id") id: string,
    @Param("commentId") commentId: string,
    @Body()
    updateData: {
      isCompleted?: boolean;
    },
    @Request() req
  ) {
    return this.recordsService.updateComment(
      id,
      commentId,
      updateData,
      req.user
    );
  }

  @Delete("delete-many")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async deleteManyRecords(@Body("ids") ids: string[]) {
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException(
        "Record IDs must be provided as an array of strings."
      );
    }
    return this.recordsService.deleteMany(ids);
  }
}
