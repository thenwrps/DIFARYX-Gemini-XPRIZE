import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const IV_BYTES = 12;
const TAG_BYTES = 16;

export function sealPayload(value: unknown, secret: string, purpose: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret, purpose), iv);
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}

export function openPayload(value: string, secret: string, purpose: string): unknown {
  try {
    const encoded = Buffer.from(value, 'base64url');
    if (encoded.length <= IV_BYTES + TAG_BYTES) throw new Error('Malformed payload');
    const iv = encoded.subarray(0, IV_BYTES);
    const tag = encoded.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const encrypted = encoded.subarray(IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv('aes-256-gcm', deriveKey(secret, purpose), iv);
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString('utf8')) as unknown;
  } catch {
    throw new Error('Invalid sealed payload');
  }
}

export function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  return leftBuffer.length === rightBuffer.length
    && timingSafeEqual(leftBuffer, rightBuffer);
}

function deriveKey(secret: string, purpose: string): Buffer {
  return createHash('sha256').update(`${purpose}\0${secret}`, 'utf8').digest();
}
