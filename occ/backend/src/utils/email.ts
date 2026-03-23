import nodemailer from "nodemailer";
import { env } from "../config/env";
import { logger } from "../lib/logger";

const createTransporter = () => {
  if (env.smtpHost && env.smtpUser && env.smtpPass) {
    return nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpPort === 465, // true for 465, false for other ports
      auth: {
        user: env.smtpUser,
        pass: env.smtpPass
      }
    });
  }
  return null;
};

const transporter = createTransporter();

export const sendPasswordResetEmail = async (to: string, resetToken: string) => {
  const resetLink = `${env.appUrl}/reset-password?token=${resetToken}`;
  const mailOptions = {
    from: env.smtpFrom,
    to,
    subject: "Reset your OffCampusClub password",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2>Password Reset Request</h2>
        <p>You recently requested to reset your password for your OffCampusClub account. Click the button below to reset it.</p>
        <div style="margin: 30px 0;">
          <a href="${resetLink}" style="background-color: #0070f3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Reset Password</a>
        </div>
        <p>If you did not request a password reset, please ignore this email or reply to let us know. This password reset link is only valid for the next 1 hour.</p>
        <p>Thanks,<br>The OffCampusClub Team</p>
        <hr style="border: none; border-top: 1px solid #eaeaea; margin: 20px 0;">
        <p style="color: #666; font-size: 12px;">If you're having trouble clicking the password reset button, copy and paste the below URL into your web browser:</p>
        <p style="color: #666; font-size: 12px; word-break: break-all;"><a href="${resetLink}">${resetLink}</a></p>
      </div>
    `
  };

  if (transporter) {
    try {
      await transporter.sendMail(mailOptions);
      logger.info(`Password reset email sent to ${to}`);
    } catch (error) {
      logger.error("Failed to send password reset email:");
      logger.error(error);
      throw new Error("Failed to send email");
    }
  } else {
    logger.warn("SMTP configuration is missing. Password reset email was not sent.");
    logger.info(`To: ${to}`);
    logger.info(`Reset token generated (token hidden from logs for security)`);
  }
};
