import { UserRole } from '../schemas/user-role.enum';
export declare class UpdateUserDto {
    fullName?: string;
    username?: string;
    email?: string;
    password?: string;
    role?: UserRole;
}
