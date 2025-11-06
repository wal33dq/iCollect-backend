import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailsService {
  async sendWelcomeEmail({
    to,
    username,
    fullName,
    password, // Added password
  }: {
    to: string;
    username: string;
    fullName?: string;
    password?: string; // Added password (optional for safety)
  }) {
    // configure SMTP
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 465,
      secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    // Conditionally add password to HTML if it exists
    const passwordHtml = password
      ? `<p><strong>Password:</strong> ${password}</p>
         <p>Please change this password after your first login.</p>`
      : '';

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>Welcome to Hubur Enterprises!</h2>
        <p>Hello <strong>${fullName || username}</strong>,</p>
        <p>Your account has been successfully created.</p>
        <p><strong>Platform URL:</strong> <a href="https://icollect.huburllc.com/login">https://icollect.huburllc.com/login</a></p>
        <p><strong>Username:</strong> ${username}</p>
        ${passwordHtml} 
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
}
