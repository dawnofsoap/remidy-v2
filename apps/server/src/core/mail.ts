import nodemailer from 'nodemailer';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

export function createSmtpMailer(url: string, from: string): Mailer {
  const transport = nodemailer.createTransport(url);
  return {
    async send(mail) {
      await transport.sendMail({ ...mail, from });
    },
  };
}

/** For development, so that links in messages can be followed without a mail server. */
export function createConsoleMailer(): Mailer {
  return {
    send({ to, subject, text }) {
      process.stdout.write(`\n--- Mail to ${to}: ${subject}\n${text}\n---\n`);
      return Promise.resolve();
    },
  };
}
