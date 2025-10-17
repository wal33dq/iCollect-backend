"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecordsController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const user_role_enum_1 = require("../users/schemas/user-role.enum");
const records_service_1 = require("./records.service");
const create_record_dto_1 = require("./dto/create-record.dto");
let RecordsController = class RecordsController {
    constructor(recordsService) {
        this.recordsService = recordsService;
    }
    async createRecord(createRecordDto) {
        return this.recordsService.create(createRecordDto);
    }
    async uploadFile(file, collectorId) {
        if (!file) {
            throw new common_1.BadRequestException('Make sure to upload a file');
        }
        return this.recordsService.processUpload(file.buffer, collectorId);
    }
    async getAllRecords(req, collectorId) {
        const user = req.user;
        let effectiveCollectorId = collectorId;
        if (user.role === user_role_enum_1.UserRole.COLLECTOR) {
            effectiveCollectorId = user.userId;
        }
        return this.recordsService.findAll(effectiveCollectorId);
    }
    async getHearingEvents(startDate, endDate) {
        const start = startDate ? new Date(startDate) : undefined;
        const end = endDate ? new Date(endDate) : undefined;
        return this.recordsService.getHearingEvents(start, end);
    }
    async getNotifications(req) {
        const user = req.user;
        const userId = user.role === user_role_enum_1.UserRole.COLLECTOR ? user.userId : undefined;
        return this.recordsService.getNotifications(userId, user.role);
    }
    async getOverdueEvents() {
        return this.recordsService.getOverdueEvents();
    }
    async getScheduledEvents(req, startDate, endDate) {
        const user = req.user;
        const userId = user.role === user_role_enum_1.UserRole.COLLECTOR ? user.userId : undefined;
        const start = startDate ? new Date(startDate) : undefined;
        const end = endDate ? new Date(endDate) : undefined;
        return this.recordsService.getScheduledEvents(userId, start, end);
    }
    async getRecord(id, req) {
        const record = await this.recordsService.findById(id);
        const user = req.user;
        if (user.role === user_role_enum_1.UserRole.COLLECTOR) {
            const isAssigned = record.assignedCollector &&
                typeof record.assignedCollector === 'object' &&
                record.assignedCollector._id &&
                record.assignedCollector._id.toString() === user.userId;
            const hasCommented = record.comments.some(comment => comment.author &&
                typeof comment.author === 'object' &&
                comment.author._id &&
                comment.author._id.toString() === user.userId);
            if (!isAssigned && !hasCommented) {
                throw new common_1.BadRequestException('You do not have access to this record');
            }
        }
        return record;
    }
    async assignCollector(id, collectorId) {
        if (!collectorId) {
            throw new common_1.BadRequestException('collectorId is required.');
        }
        return this.recordsService.assignCollector(id, collectorId);
    }
    async updateRecord(id, updateData, req) {
        return this.recordsService.update(id, updateData, req.user);
    }
    async addComment(id, commentData, req) {
        const comment = Object.assign(Object.assign({}, commentData), { scheduledDate: commentData.scheduledDate ? new Date(commentData.scheduledDate) : undefined });
        return this.recordsService.addComment(id, comment, req.user);
    }
    async updateComment(id, commentId, updateData, req) {
        return this.recordsService.updateComment(id, commentId, updateData, req.user);
    }
    async deleteManyRecords(ids) {
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            throw new common_1.BadRequestException('Record IDs must be provided as an array of strings.');
        }
        return this.recordsService.deleteMany(ids);
    }
};
exports.RecordsController = RecordsController;
__decorate([
    (0, common_1.Post)(),
    (0, common_1.UseGuards)(roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(user_role_enum_1.UserRole.ADMIN),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_record_dto_1.CreateRecordDto]),
    __metadata("design:returntype", Promise)
], RecordsController.prototype, "createRecord", null);
__decorate([
    (0, common_1.Post)('upload'),
    (0, common_1.UseGuards)(roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(user_role_enum_1.UserRole.ADMIN),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file')),
    __param(0, (0, common_1.UploadedFile)(new common_1.ParseFilePipe({
        validators: [
            new common_1.MaxFileSizeValidator({ maxSize: 10000000 }),
            new common_1.FileTypeValidator({ fileType: /^(application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|text\/csv)$/ }),
        ],
    }))),
    __param(1, (0, common_1.Body)('collectorId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], RecordsController.prototype, "uploadFile", null);
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Query)('collectorId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], RecordsController.prototype, "getAllRecords", null);
__decorate([
    (0, common_1.Get)('hearing-events'),
    __param(0, (0, common_1.Query)('startDate')),
    __param(1, (0, common_1.Query)('endDate')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], RecordsController.prototype, "getHearingEvents", null);
__decorate([
    (0, common_1.Get)('notifications'),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], RecordsController.prototype, "getNotifications", null);
__decorate([
    (0, common_1.Get)('overdue-events'),
    (0, common_1.UseGuards)(roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(user_role_enum_1.UserRole.ADMIN, user_role_enum_1.UserRole.SUPER_ADMIN),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], RecordsController.prototype, "getOverdueEvents", null);
__decorate([
    (0, common_1.Get)('scheduled-events'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Query)('startDate')),
    __param(2, (0, common_1.Query)('endDate')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], RecordsController.prototype, "getScheduledEvents", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], RecordsController.prototype, "getRecord", null);
__decorate([
    (0, common_1.Put)(':id/assign'),
    (0, common_1.UseGuards)(roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(user_role_enum_1.UserRole.ADMIN),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)('collectorId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], RecordsController.prototype, "assignCollector", null);
__decorate([
    (0, common_1.Put)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], RecordsController.prototype, "updateRecord", null);
__decorate([
    (0, common_1.Post)(':id/comments'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], RecordsController.prototype, "addComment", null);
__decorate([
    (0, common_1.Put)(':id/comments/:commentId'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('commentId')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object]),
    __metadata("design:returntype", Promise)
], RecordsController.prototype, "updateComment", null);
__decorate([
    (0, common_1.Delete)('delete-many'),
    (0, common_1.UseGuards)(roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(user_role_enum_1.UserRole.ADMIN, user_role_enum_1.UserRole.SUPER_ADMIN),
    __param(0, (0, common_1.Body)('ids')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Array]),
    __metadata("design:returntype", Promise)
], RecordsController.prototype, "deleteManyRecords", null);
exports.RecordsController = RecordsController = __decorate([
    (0, common_1.Controller)('records'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [records_service_1.RecordsService])
], RecordsController);
//# sourceMappingURL=records.controller.js.map