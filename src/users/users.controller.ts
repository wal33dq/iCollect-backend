import { Controller, Get, Request, UseGuards, Query, Patch, Body, Param, Delete, Put, ForbiddenException } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { UserRole } from './schemas/user-role.enum';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';

// In a real app, this DTO (Data Transfer Object) would be in its own file
// (e.g., 'src/users/dto/change-password.dto.ts')
// and would have validation decorators (@IsNotEmpty(), @MinLength())
export class ChangePasswordDto {
  oldPassword: string;
  newPassword: string;
}

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
     */
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    @Get('collectors')
    findCollectors() {
        return this.usersService.findAll({ role: UserRole.COLLECTOR });
    }

    /**
     * Finds all users, with an option to filter by role.
     */
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    @Get()
    findAll(@Query('role') role: UserRole) {
        const query = role ? { role } : {};
        return this.usersService.findAll(query);
    }

    /**
     * Updates the currently authenticated user's own profile.
     */
    @UseGuards(JwtAuthGuard)
    @Patch('profile/me')
    updateMyProfile(@Request() req, @Body() updateUserDto: UpdateUserDto) {
        const myUserId = req.user.userId; 
        return this.usersService.update(myUserId, updateUserDto, req.user);
    }

    /**
     * [NEW] Changes a user's password.
     * This endpoint matches the frontend call: PUT /api/users/:id/change-password
     * A user can change their own password.
     * An Admin can also use this to change another user's password.
     */
    @UseGuards(JwtAuthGuard)
    @Put(':id/change-password') 
    changePassword(
        @Request() req, 
        @Param('id') id: string, 
        @Body() changePasswordDto: ChangePasswordDto
    ) {
        const actor = req.user; // The authenticated user making the request
        const targetUserId = id; // The user profile being changed

        // Security Check: If the actor is NOT an admin, they can ONLY change their own password.
        if (actor.role !== UserRole.ADMIN && actor.role !== UserRole.SUPER_ADMIN) {
            if (actor.userId !== targetUserId) {
                throw new ForbiddenException('You are not authorized to perform this action.');
            }
        }
        
        // Pass to the service to handle the logic
        return this.usersService.changePassword(targetUserId, changePasswordDto, actor);
    }


    /**
     * [ADMIN] Updates a user by their ID.
     */
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    @Patch(':id')
    update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto, @Request() req) {
        return this.usersService.update(id, updateUserDto, req.user);
    }

    /**
     * Deletes a user by their ID.
     */
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    @Delete(':id')
    remove(@Param('id') id: string, @Request() req) {
        return this.usersService.remove(id, req.user);
    }
}