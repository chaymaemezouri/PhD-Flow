import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import nodemailer from 'nodemailer';
import type { OutboxStatus } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
}

@Injectable()
export class EmailService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailService.name);
  readonly sent: OutgoingEmail[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private redis: Redis | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async enqueue(recipient: string, template: string): Promise<string> {
    const row = await this.prisma.emailOutbox.create({
      data: { recipient, template },
    });
    return row.id;
  }

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    const url = this.config.get<string>('REDIS_URL');
    if (url) {
      this.redis = new Redis(url, {
        maxRetriesPerRequest: 1,
        lazyConnect: true,
        enableOfflineQueue: false,
      });
      this.redis.on('error', () => undefined);
      void this.redis.connect().catch(() => undefined);
    }
    this.timer = setInterval(() => {
      void this.drainQueue();
    }, 30_000);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
    void this.redis?.quit().catch(() => undefined);
  }

  async deliver(outboxId: string, message: OutgoingEmail): Promise<void> {
    await this.prisma.emailOutbox.update({
      where: { id: outboxId },
      data: { subject: message.subject, body: message.text },
    });
    if (process.env.NODE_ENV === 'test') {
      this.sent.push(message);
      await this.mark(outboxId, 'SENT', null);
      return;
    }

    try {
      const transport = nodemailer.createTransport({
        host: this.config.getOrThrow<string>('SMTP_HOST'),
        port: this.config.getOrThrow<number>('SMTP_PORT'),
        secure: false,
      });
      await transport.sendMail({
        from: this.config.getOrThrow<string>('MAIL_FROM'),
        to: message.to,
        subject: message.subject,
        text: message.text,
      });
      await this.mark(outboxId, 'SENT', null);
    } catch (error) {
      this.logger.error(`Email delivery failed for outbox ${outboxId}`);
      const reason = error instanceof Error ? error.message : 'delivery failed';
      await this.mark(outboxId, 'FAILED', reason.slice(0, 300));
      void this.redis?.lpush('scholarflow:mail', outboxId).catch(() => undefined);
    }
  }

  private async drainQueue(): Promise<void> {
    try {
      const id = await this.redis?.rpop('scholarflow:mail');
      if (!id) {
        await this.retryFailed();
        return;
      }
      const row = await this.prisma.emailOutbox.findUnique({ where: { id } });
      if (row && row.status === 'FAILED' && row.attempts < 5 && row.subject.length > 0) {
        await this.deliver(row.id, {
          to: row.recipient,
          subject: row.subject,
          text: row.body,
        });
      }
    } catch {
      await this.retryFailed();
    }
  }

  async retryFailed(): Promise<number> {
    const rows = await this.prisma.emailOutbox.findMany({
      where: { status: 'FAILED', attempts: { lt: 5 }, subject: { not: '' } },
      take: 20,
      orderBy: { createdAt: 'asc' },
    });
    for (const row of rows) {
      await this.deliver(row.id, {
        to: row.recipient,
        subject: row.subject,
        text: row.body,
      });
    }
    return rows.length;
  }

  private async mark(
    id: string,
    status: OutboxStatus,
    lastError: string | null,
  ): Promise<void> {
    await this.prisma.emailOutbox.update({
      where: { id },
      data: {
        status,
        lastError,
        attempts: { increment: 1 },
        sentAt: status === 'SENT' ? new Date() : null,
      },
    });
  }
}
