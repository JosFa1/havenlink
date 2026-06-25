/**
 * Shared email module. Owns the single nodemailer transporter (previously inline
 * in app.ts) and the templated transactional emails.
 */
import nodemailer from "nodemailer";
import { config } from "../config";

export const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: config.EMAIL_USER,
    pass: config.EMAIL_PASSWORD,
  },
});

/** Build the absolute verification link from the app base URL + raw token. */
function verificationLink(rawToken: string): string {
  const base = config.APP_BASE_URL.replace(/\/$/, "");
  return `${base}/auth/verify-email?token=${encodeURIComponent(rawToken)}`;
}

export async function sendVerificationEmail(
  to: string,
  rawToken: string
): Promise<void> {
  const link = verificationLink(rawToken);
  await transporter.sendMail({
    from: config.EMAIL_USER,
    to,
    subject: "Verify your HavenLink email",
    text: `Welcome to HavenLink!

Please confirm your email address by opening this link (valid for 24 hours):

${link}

If you did not create a HavenLink account, you can safely ignore this email.

— The HavenLink Team`,
  });
}
