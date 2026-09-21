/**
 * Shared email module. Owns the single nodemailer transporter (previously inline
 * in app.ts) and the templated transactional emails.
 */
import nodemailer from "nodemailer";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { config } from "../config";

export const transporter = nodemailer.createTransport({
  host: config.SMTP_HOST,
  port: config.SMTP_PORT,
  secure: config.SMTP_SECURE,
  auth: {
    user: config.SMTP_USER,
    pass: config.SMTP_PASSWORD,
  },
});

const ses = new SESv2Client({
  region: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1",
});

type EmailMessage = {
  from: string;
  to: string | string[];
  replyTo?: string;
  subject: string;
  text: string;
  html?: string;
};

function bareAddress(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] ?? value).trim();
}

/** Send through the Lambda role in production, avoiding expiring SMTP keys. */
export async function sendEmail(message: EmailMessage): Promise<void> {
  if (config.EMAIL_TRANSPORT === "ses") {
    const to = Array.isArray(message.to) ? message.to : [message.to];
    await ses.send(new SendEmailCommand({
      FromEmailAddress: bareAddress(message.from),
      Destination: { ToAddresses: to.map(bareAddress) },
      ReplyToAddresses: message.replyTo ? [bareAddress(message.replyTo)] : undefined,
      Content: {
        Simple: {
          Subject: { Data: message.subject, Charset: "UTF-8" },
          Body: {
            Text: { Data: message.text, Charset: "UTF-8" },
            ...(message.html ? { Html: { Data: message.html, Charset: "UTF-8" } } : {}),
          },
        },
      },
    }));
    return;
  }
  await transporter.sendMail(message);
}

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
  await sendEmail({
    from: config.EMAIL_FROM,
    to,
    subject: "Verify your HavenLink email",
    text: `Welcome to HavenLink!

Please confirm your email address by opening this link (valid for 24 hours):

${link}

If you did not create a HavenLink account, you can safely ignore this email.

— The HavenLink Team`,
  });
}

/**
 * Notify HavenLink that a user opted into the newsletter. Sent to the team inbox
 * with replyTo set to the subscriber, mirroring the referral/intake emails.
 */
export async function sendNewsletterSubscriberNotification(
  subscriberEmail: string
): Promise<void> {
  const submittedAt = new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "short",
  });
  await sendEmail({
    from: config.EMAIL_FROM,
    to: "havenlink.org@gmail.com",
    replyTo: subscriberEmail,
    subject: `New Newsletter Subscriber: ${subscriberEmail}`,
    text: `A user opted into the HavenLink Newsletter.

Email: ${subscriberEmail}
Subscribed: ${submittedAt} (${new Date().toISOString()})

They accepted the newsletter prompt shown after signing up.`,
  });
}
