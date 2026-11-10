import nodemailer from 'nodemailer';
import { AppError } from './errors';

export type Mail = { to: string; subject: string; text: string };
let testTransport: ((mail: Mail) => Promise<void>) | undefined;
export function setTestMailTransport(
  transport?: (mail: Mail) => Promise<void>,
) {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Test mail transport is unavailable in production');
  testTransport = transport;
}
export function assertMailAvailable() {
  if (!testTransport && (!process.env.SMTP_HOST || !process.env.MAIL_FROM))
    throw new AppError('MAIL_UNAVAILABLE', 503);
}
export async function sendMail(mail: Mail) {
  assertMailAvailable();
  if (testTransport) return testTransport(mail);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 1025),
    secure: process.env.SMTP_SECURE === 'true',
    ...(process.env.SMTP_USER
      ? {
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD,
          },
        }
      : {}),
  });
  try {
    await transport.sendMail({ ...mail, from: process.env.MAIL_FROM });
  } catch {
    throw new AppError('MAIL_UNAVAILABLE', 503);
  } finally {
    transport.close();
  }
}
