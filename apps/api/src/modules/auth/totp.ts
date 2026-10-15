import { createHmac, randomBytes } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpUri(email: string, secret: string): string {
  return `otpauth://totp/ScholarFlow:${encodeURIComponent(email)}?secret=${secret}&issuer=ScholarFlow`;
}

export function verifyTotp(secret: string, code: string): boolean {
  if (!/^\d{6}$/.test(code)) {
    return false;
  }
  const now = Date.now();
  return [-1, 0, 1].some((step) => totp(secret, now + step * 30_000) === code);
}

function totp(secret: string, time: number): string {
  const counter = Math.floor(time / 30_000);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', base32Decode(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1]! & 0xf;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 1_000_000).padStart(6, '0');
}

function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function base32Decode(secret: string): Buffer {
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of secret.toUpperCase()) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) {
      continue;
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}
