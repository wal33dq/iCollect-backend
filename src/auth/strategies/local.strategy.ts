import { Strategy } from 'passport-local';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { AuthService } from '../auth.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super({ usernameField: 'identifier', passReqToCallback: true });
  }

  async validate(req: any, identifier: string, password: string): Promise<any> {
    const ip =
      (req?.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req?.ip ||
      req?.connection?.remoteAddress ||
      'unknown';

    // validateUser will either:
    // - return user on success
    // - throw 401 with attemptsLeft on wrong password
    // - throw 429 with remaining seconds when locked
    return this.authService.validateUser(identifier, password, ip);
  }
}
