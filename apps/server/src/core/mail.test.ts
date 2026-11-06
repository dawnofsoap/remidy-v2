import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSmtpMailer } from './mail.ts';

const SMTP_PORT = 1025;
const API_PORT = 8025;

describe('sending mail over SMTP', () => {
  let container: StartedTestContainer;

  beforeAll(async () => {
    container = await new GenericContainer('axllent/mailpit:v1.29')
      .withExposedPorts(SMTP_PORT, API_PORT)
      .withWaitStrategy(Wait.forListeningPorts())
      .start();
  }, 180_000);

  afterAll(async () => {
    await container.stop();
  });

  const url = () => `smtp://${container.getHost()}:${String(container.getMappedPort(SMTP_PORT))}`;

  it('delivers a message to a real mail server', async () => {
    const mailer = createSmtpMailer(url(), 'Remidy <remidy@example.com>');
    await mailer.send({
      to: 'alex@example.com',
      subject: 'Reset your Remidy password',
      text: 'The link goes here.',
    });

    const api = `http://${container.getHost()}:${String(container.getMappedPort(API_PORT))}`;
    const response = await fetch(`${api}/api/v1/messages`);
    const { messages } = (await response.json()) as {
      messages: {
        Subject: string;
        Snippet: string;
        From: { Address: string };
        To: { Address: string }[];
      }[];
    };
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      Subject: 'Reset your Remidy password',
      Snippet: 'The link goes here.',
      From: { Address: 'remidy@example.com' },
      To: [{ Address: 'alex@example.com' }],
    });
  });

  it('reports a failure, rather than losing the message silently', async () => {
    const mailer = createSmtpMailer('smtp://127.0.0.1:9', 'remidy@example.com');
    await expect(
      mailer.send({ to: 'alex@example.com', subject: 'Hello', text: 'Hello' }),
    ).rejects.toThrow();
  });
});
