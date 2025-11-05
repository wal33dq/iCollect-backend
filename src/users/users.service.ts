import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User, UserDocument } from './schemas/user.schema';
import { UserRole } from './schemas/user-role.enum';
import * as bcrypt from 'bcrypt';

// In a real app, this DTO (Data Transfer Object) would be in its own file
export class ChangePasswordDto {
  oldPassword: string;
  newPassword: string;
}

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    const createdUser = new this.userModel(createUserDto);
    return createdUser.save();
  }

  /**
   * Finds all users that match a given query.
   */
  async findAll(query: { role?: UserRole }): Promise<User[]> {
      return this.userModel.find(query).select('-password').exec();
  }

  async findOne(identifier: string): Promise<UserDocument | undefined> {
    const lowercasedIdentifier = identifier.toLowerCase();
    return this.userModel.findOne({
      $or: [{ email: lowercasedIdentifier }, { username: lowercasedIdentifier }],
    }).exec();
  }

  async findById(id: string): Promise<User | undefined> {
    return this.userModel.findById(id).exec();
  }

  /**
   * [NEW] Changes a user's password.
   * If the actor is the same as the target user, it validates the old password.
   * If the actor is an Admin/Super Admin changing *another* user's password,
   * it bypasses the old password check.
   */
  async changePassword(targetUserId: string, changePasswordDto: ChangePasswordDto, actor: any): Promise<User> {
    // We need the full user document to get the current hashed password
    const targetUser = await this.userModel.findById(targetUserId).exec();
    if (!targetUser) {
      throw new NotFoundException(`User with ID "${targetUserId}" not found`);
    }

    const { oldPassword, newPassword } = changePasswordDto;
    const actorId = actor.userId;
    const actorRole = actor.role;
    const isEditingSelf = actorId === targetUserId;

    // --- CASE 1: User is changing their own password ---
    if (isEditingSelf) {
      if (!oldPassword) {
        throw new ForbiddenException('Old password is required to change your own password.');
      }
      
      // Validate the old password
      const isMatch = await bcrypt.compare(oldPassword, targetUser.password);
      if (!isMatch) {
        throw new ForbiddenException('Incorrect old password.');
      }
    } 
    // --- CASE 2: Admin is changing another user's password ---
    else {
      // Admin permissions check
      const targetRole = targetUser.role;

      // Rule: An Admin cannot edit a Super Admin.
      if (actorRole === UserRole.ADMIN && targetRole === UserRole.SUPER_ADMIN) {
        throw new ForbiddenException('Admins cannot change a Super Admin\'s password.');
      }
      // (Super Admins can change anyone's password)
    }

    // If all checks pass, set the new password.
    if (!newPassword || newPassword.trim().length < 6) {
        // The modal already checks this, but good to have backend validation.
        throw new ForbiddenException('New password must be at least 6 characters long.');
    }

    // Set the password. The 'pre-save' hook in user.schema.ts will auto-hash this.
    targetUser.password = newPassword;
    
    // We must call .save() to trigger the 'pre-save' hashing hook.
    // (Note: findByIdAndUpdate would NOT trigger the hook)
    const savedUser = await targetUser.save();

    // Return a clean user object (without password)
    const userObject = savedUser.toObject();
    delete userObject.password;
    delete userObject.refreshToken;
    return userObject;
  }

  async update(id: string, updateUserDto: UpdateUserDto, actor: any): Promise<User> {
    const targetUser = await this.userModel.findById(id).exec();
    if (!targetUser) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }

    const actorId = actor.userId;
    const actorRole = actor.role;
    const targetRole = targetUser.role;
    const isEditingSelf = actorId === id;

    if (isEditingSelf) {
      if (updateUserDto.role && updateUserDto.role !== targetRole) {
        throw new ForbiddenException('You cannot change your own role.');
      }
      delete updateUserDto.role;

    } else {
      if (actorRole === UserRole.ADMIN && targetRole === UserRole.SUPER_ADMIN) {
        throw new ForbiddenException('Admins cannot edit Super Admins.');
      }
      if (actorRole === UserRole.ADMIN && updateUserDto.role === UserRole.SUPER_ADMIN && targetRole !== UserRole.SUPER_ADMIN) {
        throw new ForbiddenException('Admins cannot promote users to Super Admin.');
      }
    }

    // --- SECURITY FIX ---
    // The original code did not hash the password here because
    // findByIdAndUpdate bypasses the 'pre-save' Mongoose hook.
    // We must hash it manually *before* the update.
    if (updateUserDto.password) {
      if (updateUserDto.password.trim().length > 0) {
        // Manually hash the password
        updateUserDto.password = await bcrypt.hash(updateUserDto.password, 10);
      } else {
        delete updateUserDto.password;
      }
    }

    // Use $set to only update fields that are present in the DTO
    const existingUser = await this.userModel.findByIdAndUpdate(id, { $set: updateUserDto }, { new: true }).select('-password').exec();
    
    if (!existingUser) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }
    return existingUser;
  }

  async remove(id: string, actor: any): Promise<User> {
    if (actor.userId === id) {
        throw new ForbiddenException('You cannot delete your own account.');
    }

    const targetUser = await this.userModel.findById(id).exec();
    if (!targetUser) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }

    const actorRole = actor.role;
    const targetRole = targetUser.role;
    
    if (actorRole === UserRole.ADMIN && targetRole === UserRole.SUPER_ADMIN) {
        throw new ForbiddenException('Admins cannot delete Super Admins.');
    }

    const deletedUser = await this.userModel.findByIdAndDelete(id).select('-password').exec();
    if (!deletedUser) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }
    return deletedUser;
  }
}