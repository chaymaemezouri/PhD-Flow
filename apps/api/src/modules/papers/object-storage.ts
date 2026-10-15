import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ObjectStorage {
  private readonly memory = new Map<string, Buffer>();
  private client: S3Client | null = null;

  constructor(private readonly config: ConfigService) {}

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    if (this.memoryMode()) {
      this.memory.set(key, Buffer.from(body));
      return;
    }
    await this.s3().send(
      new PutObjectCommand({
        Bucket: this.bucket(),
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async get(key: string): Promise<Buffer> {
    if (this.memoryMode()) {
      const found = this.memory.get(key);
      if (!found) {
        throw new NotFoundException('File not found');
      }
      return found;
    }
    const result = await this.s3().send(
      new GetObjectCommand({ Bucket: this.bucket(), Key: key }),
    );
    const bytes = await result.Body?.transformToByteArray();
    if (!bytes) {
      throw new NotFoundException('File not found');
    }
    return Buffer.from(bytes);
  }

  async remove(key: string): Promise<void> {
    if (this.memoryMode()) {
      this.memory.delete(key);
      return;
    }
    await this.s3().send(new DeleteObjectCommand({ Bucket: this.bucket(), Key: key }));
  }

  private memoryMode(): boolean {
    return process.env.NODE_ENV === 'test';
  }

  private bucket(): string {
    return this.config.getOrThrow<string>('MINIO_BUCKET');
  }

  private s3(): S3Client {
    if (!this.client) {
      const port = this.config.getOrThrow<number>('MINIO_PORT');
      const endpoint = this.config.get<string>('MINIO_ENDPOINT') || `http://127.0.0.1:${port}`;
      this.client = new S3Client({
        region: 'us-east-1',
        endpoint,
        forcePathStyle: true,
        credentials: {
          accessKeyId: this.config.getOrThrow<string>('MINIO_ROOT_USER'),
          secretAccessKey: this.config.getOrThrow<string>('MINIO_ROOT_PASSWORD'),
        },
      });
    }
    return this.client;
  }
}
