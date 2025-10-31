import { Controller, Get, Request, UseGuards, Query, Patch, Body, Param, Delete } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { UserRole } from './schemas/user-role.enum';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('users')
export class UsersController {
    constructor(private readonly usersService: UsersService) {}

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    @Get('profile')
    getProfile(@Request() req) {
        return req.user;
    }

    /**
     * Finds all users with the 'Collector' role.
     * This is used by the Admin Page to populate dropdowns for assigning records.
     */
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    @Get('collectors')
    findCollectors() {
        return this.usersService.findAll({ role: UserRole.COLLECTOR });
    }

    /**
     * Finds all users, with an option to filter by role.
     * This is used by the Admin Page to get a list of all 'Collectors'.
     * Only an Admin should be able to access this list.
     */
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    @Get()
    findAll(@Query('role') role: UserRole) {
        // If a role is provided in the query (e.g., /api/users?role=Collector),
        // it will be passed to the service to filter the results.
        const query = role ? { role } : {};
        return this.usersService.findAll(query);
    }

    /**
     * [NEW] Updates the currently authenticated user's own profile.
     * Any authenticated user can perform this action for themselves.
     */
    @UseGuards(JwtAuthGuard)
    @Patch('profile/me')
    updateMyProfile(@Request() req, @Body() updateUserDto: UpdateUserDto) {
        // Get the user ID from the authenticated request token
        const myUserId = req.user.userId; 
        
        // We pass req.user as the 'actor' for the service logic
        return this.usersService.update(myUserId, updateUserDto, req.user);
    }

    /**
     * [ADMIN] Updates a user by their ID.
     * Only Admins and Super Admins can perform this action.
     * We pass the requesting user (`req.user`) to the service for permission checks.
     */
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    @Patch(':id')
    update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto, @Request() req) {
        return this.usersService.update(id, updateUserDto, req.user);
    }

    /**
     * Deletes a user by their ID.
     * Only Admins and Super Admins can perform this action.
     * We pass the requesting user (`req.user`) to the service for permission checks.
     */
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    @Delete(':id')
    remove(@Param('id') id: string, @Request() req) {
        return this.usersService.remove(id, req.user);
    }
}
