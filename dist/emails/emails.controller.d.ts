import { EmailsService } from './emails.service';
export declare class EmailsController {
    private readonly emailsService;
    constructor(emailsService: EmailsService);
    sendWelcomeEmail(body: {
        to: string;
        username: string;
        fullName?: string;
    }): Promise<{
        success: boolean;
        message: string;
    }>;
}
