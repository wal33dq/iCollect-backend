import { UserRole } from '../schemas/user-role.enum';
export declare class CreateUserDto {
    fullName: string;
    username: string;
    email: string;
    password: string;
    role: UserRole;
}
