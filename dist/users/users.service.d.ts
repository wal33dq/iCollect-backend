import { Model } from 'mongoose';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User, UserDocument } from './schemas/user.schema';
import { UserRole } from './schemas/user-role.enum';
export declare class UsersService {
    private userModel;
    constructor(userModel: Model<UserDocument>);
    create(createUserDto: CreateUserDto): Promise<User>;
    findAll(query: {
        role?: UserRole;
    }): Promise<User[]>;
    findOne(identifier: string): Promise<UserDocument | undefined>;
    findById(id: string): Promise<User | undefined>;
    update(id: string, updateUserDto: UpdateUserDto, actor: any): Promise<User>;
    remove(id: string, actor: any): Promise<User>;
}
