import { Injectable, OnModuleInit } from '@nestjs/common';
import argon2 from 'argon2';

@Injectable()
export class PasswordService implements OnModuleInit {
  private dummyHash = '';

  async onModuleInit(): Promise<void> {
    this.dummyHash = await this.hash(newSecretPlaceholder());
  }

  async hash(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
  }

  async verify(hash: string, password: string): Promise<boolean> {
    const target = hash.length > 0 ? hash : this.dummyHash;
    try {
      const matches = await argon2.verify(target, password);
      return hash.length > 0 && matches;
    } catch {
      return false;
    }
  }
}

function newSecretPlaceholder(): string {
  return `unused-${Date.now()}`;
}
