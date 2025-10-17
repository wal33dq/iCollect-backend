"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailsService = void 0;
const common_1 = require("@nestjs/common");
const nodemailer = require("nodemailer");
let EmailsService = class EmailsService {
    async sendWelcomeEmail({ to, username, fullName, }) {
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT) || 465,
            secure: true,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
        });
        const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>Welcome to Hubur Enterprises!</h2>
        <p>Hello <strong>${fullName || username}</strong>,</p>
        <p>Your account has been successfully created.</p>
        <p><strong>Username:</strong> ${username}</p>
        <p>We're excited to have you on board!</p>
        <br />
        <p>Best regards,<br />Hubur Support Team</p>
      </div>
    `;
        await transporter.sendMail({
            from: `"Hubur Enterprises" <${process.env.SMTP_USER}>`,
            to,
            subject: 'Welcome to Hubur Enterprises!',
            html,
        });
        return { success: true, message: 'Welcome email sent successfully.' };
    }
};
exports.EmailsService = EmailsService;
exports.EmailsService = EmailsService = __decorate([
    (0, common_1.Injectable)()
], EmailsService);
//# sourceMappingURL=emails.service.js.map