import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User, UserDocument } from './schemas/user.schema';
import { UserRole } from './schemas/user-role.enum';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    const createdUser = new this.userModel(createUserDto);
    return createdUser.save();
  }

  /**
   * Finds all users that match a given query.
   * We also remove the password field from the result for security.
   * @param query - An object to filter users (e.g., { role: UserRole.COLLECTOR })
   */
  async findAll(query: { role?: UserRole }): Promise<User[]> {
      return this.userModel.find(query).select('-password').exec();
  }

  async findOne(identifier: string): Promise<UserDocument | undefined> {
    // Convert identifier to lowercase to ensure case-insensitive search
    const lowercasedIdentifier = identifier.toLowerCase();
    return this.userModel.findOne({
      $or: [{ email: lowercasedIdentifier }, { username: lowercasedIdentifier }],
    }).exec();
  }

  async findById(id: string): Promise<User | undefined> {
    return this.userModel.findById(id).exec();
  }

  async update(id: string, updateUserDto: UpdateUserDto, actor: any): Promise<User> {
    const targetUser = await this.userModel.findById(id).exec();
    if (!targetUser) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }

    const actorRole = actor.role;
    const targetRole = targetUser.role;

    // Rule: An Admin cannot edit a Super Admin.
    if (actorRole === UserRole.ADMIN && targetRole === UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Admins cannot edit Super Admins.');
    }

    // Rule: An Admin cannot promote a user to Super Admin.
    if (actorRole === UserRole.ADMIN && updateUserDto.role === UserRole.SUPER_ADMIN && targetRole !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Admins cannot promote users to Super Admin.');
    }

    // If a new password is provided, hash it before saving.
    if (updateUserDto.password) {
      updateUserDto.password = await bcrypt.hash(updateUserDto.password, 10);
    }

    const existingUser = await this.userModel.findByIdAndUpdate(id, updateUserDto, { new: true }).select('-password').exec();
    if (!existingUser) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }
    return existingUser;
  }

  async remove(id: string, actor: any): Promise<User> {
    // Rule: A user cannot delete themselves.
    if (actor.userId === id) {
        throw new ForbiddenException('You cannot delete your own account.');
    }

    const targetUser = await this.userModel.findById(id).exec();
    if (!targetUser) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }

    const actorRole = actor.role;
    const targetRole = targetUser.role;
    
    // Rule: An Admin cannot delete a Super Admin.
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

