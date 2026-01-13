import {
  Injectable,
  ForbiddenException,
  ConflictException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { CreateUserDto } from 'src/users/dto/create-user.dto';
import { User } from 'src/users/schemas/user.schema';
import { ConfigService } from '@nestjs/config';

type AttemptsRecord = {
  count: number;
  firstAt: number;
};

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  // ===== Brute-force protection =====
  private readonly MAX_FAILED_ATTEMPTS = 5;
  private readonly LOCK_MS = 5 * 60 * 1000; // 5 minutes

  // In-memory stores (no extra packages needed)
  private static attempts = new Map<string, AttemptsRecord>();
  private static locks = new Map<string, number>(); // key -> lockUntil timestamp

  private makeKey(identifier: string, ip: string) {
    const id = (identifier || '').trim().toLowerCase();
    const addr = (ip || 'unknown').trim();
    return `${id}::${addr}`;
  }

  private cleanupExpired(key: string) {
    const lockUntil = AuthService.locks.get(key);
    if (lockUntil && Date.now() >= lockUntil) AuthService.locks.delete(key);

    const rec = AuthService.attempts.get(key);
    if (rec && Date.now() - rec.firstAt > this.LOCK_MS) AuthService.attempts.delete(key);
  }

  async validateUser(identifier: string, pass: string, ip = 'unknown'): Promise<any> {
    const key = this.makeKey(identifier, ip);

    // cleanup old entries to prevent memory growth
    this.cleanupExpired(key);

    // 1) If locked -> 429
    const lockUntil = AuthService.locks.get(key);
    if (lockUntil && Date.now() < lockUntil) {
      const remainingSeconds = Math.max(1, Math.ceil((lockUntil - Date.now()) / 1000));
      throw new HttpException(
        `Too many failed login attempts. Try again in ${remainingSeconds} seconds.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 2) Validate credentials
    const user = await this.usersService.findOne(identifier);
    const ok = user && (await bcrypt.compare(pass, user.password));

    if (ok) {
      // success -> clear attempts/lock
      AuthService.attempts.delete(key);
      AuthService.locks.delete(key);

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password, ...result } = user.toObject();
      return result;
    }

    // 3) Failed -> increment attempts (rolling 5-min window)
    const now = Date.now();
    const existing = AuthService.attempts.get(key);

    let count = 0;
    let firstAt = now;

    if (existing && now - existing.firstAt <= this.LOCK_MS) {
      count = existing.count;
      firstAt = existing.firstAt;
    }

    const nextCount = count + 1;
    const attemptsLeft = Math.max(0, this.MAX_FAILED_ATTEMPTS - nextCount);

    // lock if reached max
    if (nextCount >= this.MAX_FAILED_ATTEMPTS) {
      AuthService.locks.set(key, now + this.LOCK_MS);
      AuthService.attempts.delete(key);

      // immediately return locked
      throw new HttpException(
        `Too many failed login attempts. Try again in ${Math.ceil(this.LOCK_MS / 1000)} seconds.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // store attempts
    AuthService.attempts.set(key, { count: nextCount, firstAt });

    // 401 with attempts left
    throw new HttpException(
      {
        statusCode: 401,
        message: 'Invalid username/email or password.',
        attemptsLeft,
      },
      HttpStatus.UNAUTHORIZED,
    );
  }

  async getTokens(userId: string, username: string, role: string) {
    // NOTE: Some hosting environments (Namecheap/AWS) can have stricter @types/jsonwebtoken
    // which requires expiresIn to be `number | StringValue` (not a generic `string | undefined`).
    // So we normalize the values and cast safely.
    const payload: { sub: string; username: string; role: string } = {
      sub: String(userId),
      username: String(username),
      role: String(role),
    };

    const accessSecret =
      this.configService.get<string>('JWT_SECRET') || 'yourSecretKey';
    const refreshSecret =
      this.configService.get<string>('JWT_REFRESH_SECRET') || 'yourRefreshSecretKey';

    const accessExpRaw =
      this.configService.get<any>('JWT_EXPIRATION_TIME') ?? '60m';
    const refreshExpRaw =
      this.configService.get<any>('JWT_REFRESH_EXPIRATION_TIME') ?? '7d';

    // Convert to number if numeric, else to string (e.g. "60m", "7d")
    const accessExpiresIn: any =
      typeof accessExpRaw === 'number' ? accessExpRaw : String(accessExpRaw);
    const refreshExpiresIn: any =
      typeof refreshExpRaw === 'number' ? refreshExpRaw : String(refreshExpRaw);

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload as any, {
        secret: accessSecret,
        expiresIn: accessExpiresIn,
      } as any),
      this.jwtService.signAsync(payload as any, {
        secret: refreshSecret,
        expiresIn: refreshExpiresIn,
      } as any),
    ]);

    return { access_token: accessToken, refresh_token: refreshToken };
  }

  async updateRefreshToken(user: any, refreshToken: string) {
    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
    await this.usersService.update(
      (user as any)._id,
      { refreshToken: hashedRefreshToken } as any,
      user,
    );
  }

  async login(user: User | any) {
    const tokens = await this.getTokens((user as any)._id, user.username, user.role);
    await this.updateRefreshToken(user, tokens.refresh_token);
    return tokens;
  }

  async register(createUserDto: CreateUserDto) {
    const existingUser =
      (await this.usersService.findOne(createUserDto.email)) ||
      (await this.usersService.findOne(createUserDto.username));

    if (existingUser) {
      throw new ConflictException('Username or email already exists');
    }

    const user = await this.usersService.create(createUserDto);
    return this.login(user);
  }

  async refreshTokens(userId: string, refreshToken: string) {
    const user = await this.usersService.findById(userId);
    if (!user || !user.refreshToken) throw new ForbiddenException('Access Denied');

    const refreshTokenMatches = await bcrypt.compare(refreshToken, user.refreshToken);
    if (!refreshTokenMatches) throw new ForbiddenException('Access Denied');

    const tokens = await this.getTokens((user as any)._id, user.username, user.role);
    await this.updateRefreshToken(user, tokens.refresh_token);
    return { access_token: tokens.access_token };
  }
}
