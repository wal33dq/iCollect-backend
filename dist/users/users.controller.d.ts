import { UserRole } from './schemas/user-role.enum';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
export declare class UsersController {
    private readonly usersService;
    constructor(usersService: UsersService);
    getProfile(req: any): any;
    findCollectors(): Promise<import("./schemas/user.schema").User[]>;
    findAll(role: UserRole): Promise<import("./schemas/user.schema").User[]>;
    update(id: string, updateUserDto: UpdateUserDto, req: any): Promise<import("./schemas/user.schema").User>;
    remove(id: string, req: any): Promise<import("./schemas/user.schema").User>;
}
