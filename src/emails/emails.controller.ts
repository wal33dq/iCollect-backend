import { Controller, Post, Body } from '@nestjs/common';
import { EmailsService } from './emails.service';

@Controller('emails')
export class EmailsController {
  constructor(private readonly emailsService: EmailsService) {}

  @Post('welcome')
  async sendWelcomeEmail(
    @Body()
    body: {
      to: string;
      username: string;
      fullName?: string;
      password?: string; // Added password
    },
  ) {
    return this.emailsService.sendWelcomeEmail(body);
  }
}
