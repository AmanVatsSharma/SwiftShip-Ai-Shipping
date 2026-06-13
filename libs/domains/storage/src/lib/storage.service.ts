import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { promises as fs } from 'fs';
import { dirname, join } from 'path';
import { Readable } from 'stream';

type StorageDriver = 's3' | 'stub';

interface UploadOptions {
  cacheControl?: string;
}

/**
 * Storage Service
 *
 * Provides a unified abstraction for uploading/downloading binary assets.
 * Prefers S3-compatible storage when configured, otherwise transparently
 * falls back to an on-disk stub for developer environments.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly driver: StorageDriver;
  private readonly bucket?: string;
  private readonly baseUrl: string;
  private readonly localRoot: string;
  private readonly s3?: S3Client;

  constructor(private readonly config: ConfigService) {
    this.driver = this.resolveDriver();
    this.bucket = this.config.get<string>('S3_BUCKET') || undefined;
    this.baseUrl = this.config.get<string>('APP_URL') || 'http://localhost:3000';
    this.localRoot = join(process.cwd(), 'storage');

    if (this.driver === 's3' && this.bucket) {
      this.s3 = new S3Client({
        region: this.config.get<string>('S3_REGION') || 'ap-south-1',
        endpoint: this.config.get<string>('S3_ENDPOINT') || undefined,
        forcePathStyle:
          (this.config.get<string>('S3_FORCE_PATH_STYLE') || 'false').toLowerCase() === 'true',
        credentials: this.getS3Credentials(),
      });
      this.logger.log('S3 storage driver initialized', {
        bucket: this.bucket,
        endpoint: this.config.get<string>('S3_ENDPOINT') || 'aws',
      });
    } else {
      this.logger.warn('Falling back to stub storage driver', {
        localRoot: this.localRoot,
      });
    }
  }

  /**
   * Upload a buffer to storage.
   */
  async uploadBuffer(
    key: string,
    buffer: Buffer,
    contentType: string,
    options?: UploadOptions,
  ): Promise<{ key: string; url: string }> {
    console.log('[StorageService] uploadBuffer', { key, driver: this.driver });

    if (!key) {
      throw new Error('Storage key is required');
    }

    if (this.driver === 's3' && this.s3 && this.bucket) {
      await this.uploadToS3(key, buffer, contentType, options);
      const url = await this.getPublicUrl(key);
      return { key, url };
    }

    const url = await this.uploadToStub(key, buffer);
    return { key, url };
  }

  /**
   * Download object as Buffer for attachment generation.
   */
  async getObjectBuffer(key: string): Promise<Buffer> {
    console.log('[StorageService] getObjectBuffer', { key, driver: this.driver });

    if (this.driver === 's3' && this.s3 && this.bucket) {
      const result = await this.s3.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      return this.streamToBuffer(result.Body as Readable);
    }

    const filePath = join(this.localRoot, key);
    return fs.readFile(filePath);
  }

  /**
   * Generate a signed or pseudo URL for the stored object.
   */
  async getPublicUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    if (this.driver === 's3' && this.s3 && this.bucket) {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      return getSignedUrl(this.s3, command, { expiresIn: expiresInSeconds });
    }

    return `${this.baseUrl}/storage/${key}`;
  }

  private resolveDriver(): StorageDriver {
    const configuredDriver = (this.config.get<string>('STORAGE_DRIVER') || 'stub').toLowerCase();
    if (configuredDriver === 's3' && this.config.get<string>('S3_BUCKET')) {
      return 's3';
    }
    return 'stub';
  }

  private getS3Credentials() {
    const accessKeyId = this.config.get<string>('S3_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('S3_SECRET_ACCESS_KEY');

    if (accessKeyId && secretAccessKey) {
      return { accessKeyId, secretAccessKey };
    }

    return undefined;
  }

  private async uploadToS3(
    key: string,
    buffer: Buffer,
    contentType: string,
    options?: UploadOptions,
  ) {
    if (!this.s3 || !this.bucket) {
      throw new Error('S3 client not configured');
    }

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        CacheControl: options?.cacheControl,
      }),
    );

    this.logger.log('Uploaded object to S3', { key, bucket: this.bucket });
  }

  private async uploadToStub(key: string, buffer: Buffer): Promise<string> {
    const filePath = join(this.localRoot, key);
    await fs.mkdir(dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, buffer);
    this.logger.log('Stored object in stub storage', { key, filePath });
    return `${this.baseUrl}/storage/${key}`;
  }

  private async streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    return new Promise<Buffer>((resolve, reject) => {
      stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      stream.on('error', (err) => reject(err));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }
}
