import { Injectable, ForbiddenException, ConflictException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { CreateUserDto } from 'src/users/dto/create-user.dto';
import { User } from 'src/users/schemas/user.schema';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async validateUser(identifier: string, pass: string): Promise<any> {
    const user = await this.usersService.findOne(identifier);
    if (user && (await bcrypt.compare(pass, user.password))) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password, ...result } = user.toObject();
      return result;
    }
    return null;
  }
  
  async getTokens(userId: string, username: string, role: string) {
    const payload = { sub: userId, username, role };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_SECRET'),
        expiresIn: this.configService.get<string>('JWT_EXPIRATION_TIME'),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRATION_TIME'),
      }),
    ]);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
    };
  }

  async updateRefreshToken(user: any, refreshToken: string) {
    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
    // The actor (the user themselves) is now passed as the third argument
    // Cast the update object to 'any' to bypass the UpdateUserDto type check
    await this.usersService.update((user as any)._id, {
      refreshToken: hashedRefreshToken,
    } as any, user);
  }

  async login(user: User | any) {
    // Reverted to user._id and cast to any to solve the type error
    const tokens = await this.getTokens((user as any)._id, user.username, user.role);
    // Pass the whole user object instead of just the id
    await this.updateRefreshToken(user, tokens.refresh_token);
    return tokens;
  }

  async register(createUserDto: CreateUserDto) {
    const existingUser = await this.usersService.findOne(createUserDto.email) || await this.usersService.findOne(createUserDto.username);
    if (existingUser) {
      throw new ConflictException('Username or email already exists');
    }
    const user = await this.usersService.create(createUserDto);
    return this.login(user); // Automatically log in and return tokens
  }

  async refreshTokens(userId: string, refreshToken: string) {
    const user = await this.usersService.findById(userId);
    if (!user || !user.refreshToken) {
      throw new ForbiddenException('Access Denied');
    }

    const refreshTokenMatches = await bcrypt.compare(
      refreshToken,
      user.refreshToken,
    );

    if (!refreshTokenMatches) {
      throw new ForbiddenException('Access Denied');
    }
    
    // Issue new tokens
    // Reverted to user._id and cast to any to solve the type error
    const tokens = await this.getTokens((user as any)._id, user.username, user.role);
    // Pass the whole user object
    await this.updateRefreshToken(user, tokens.refresh_token);
    // Return only the new access token to the frontend
    return { access_token: tokens.access_token };
  }
}

