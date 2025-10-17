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
exports.UsersService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const user_schema_1 = require("./schemas/user.schema");
const user_role_enum_1 = require("./schemas/user-role.enum");
const bcrypt = require("bcrypt");
let UsersService = class UsersService {
    constructor(userModel) {
        this.userModel = userModel;
    }
    async create(createUserDto) {
        const createdUser = new this.userModel(createUserDto);
        return createdUser.save();
    }
    async findAll(query) {
        return this.userModel.find(query).select('-password').exec();
    }
    async findOne(identifier) {
        const lowercasedIdentifier = identifier.toLowerCase();
        return this.userModel.findOne({
            $or: [{ email: lowercasedIdentifier }, { username: lowercasedIdentifier }],
        }).exec();
    }
    async findById(id) {
        return this.userModel.findById(id).exec();
    }
    async update(id, updateUserDto, actor) {
        const targetUser = await this.userModel.findById(id).exec();
        if (!targetUser) {
            throw new common_1.NotFoundException(`User with ID "${id}" not found`);
        }
        const actorRole = actor.role;
        const targetRole = targetUser.role;
        if (actorRole === user_role_enum_1.UserRole.ADMIN && targetRole === user_role_enum_1.UserRole.SUPER_ADMIN) {
            throw new common_1.ForbiddenException('Admins cannot edit Super Admins.');
        }
        if (actorRole === user_role_enum_1.UserRole.ADMIN && updateUserDto.role === user_role_enum_1.UserRole.SUPER_ADMIN && targetRole !== user_role_enum_1.UserRole.SUPER_ADMIN) {
            throw new common_1.ForbiddenException('Admins cannot promote users to Super Admin.');
        }
        if (updateUserDto.password) {
            updateUserDto.password = await bcrypt.hash(updateUserDto.password, 10);
        }
        const existingUser = await this.userModel.findByIdAndUpdate(id, updateUserDto, { new: true }).select('-password').exec();
        if (!existingUser) {
            throw new common_1.NotFoundException(`User with ID "${id}" not found`);
        }
        return existingUser;
    }
    async remove(id, actor) {
        if (actor.userId === id) {
            throw new common_1.ForbiddenException('You cannot delete your own account.');
        }
        const targetUser = await this.userModel.findById(id).exec();
        if (!targetUser) {
            throw new common_1.NotFoundException(`User with ID "${id}" not found`);
        }
        const actorRole = actor.role;
        const targetRole = targetUser.role;
        if (actorRole === user_role_enum_1.UserRole.ADMIN && targetRole === user_role_enum_1.UserRole.SUPER_ADMIN) {
            throw new common_1.ForbiddenException('Admins cannot delete Super Admins.');
        }
        const deletedUser = await this.userModel.findByIdAndDelete(id).select('-password').exec();
        if (!deletedUser) {
            throw new common_1.NotFoundException(`User with ID "${id}" not found`);
        }
        return deletedUser;
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(user_schema_1.User.name)),
    __metadata("design:paramtypes", [mongoose_2.Model])
], UsersService);
//# sourceMappingURL=users.service.js.map