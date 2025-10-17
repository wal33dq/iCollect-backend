export declare class EmailsService {
    sendWelcomeEmail({ to, username, fullName, }: {
        to: string;
        username: string;
        fullName?: string;
    }): Promise<{
        success: boolean;
        message: string;
    }>;
}
