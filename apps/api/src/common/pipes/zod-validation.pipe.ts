import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) {
      const message = parsed.error.issues.map((issue) => issue.message).join('; ');
      throw new BadRequestException(message || 'Invalid request');
    }
    return parsed.data;
  }
}
