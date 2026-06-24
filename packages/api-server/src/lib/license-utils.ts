import crypto from 'crypto';

/**
 * Generates a unique, formatted license key in the format MP-XXXX-XXXX-XXXX-XXXX.
 * Uses cryptographically secure random bytes.
 */
export function generateLicenseKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const segment = () => {
    let result = '';
    const bytes = crypto.randomBytes(4);
    for (let i = 0; i < 4; i++) {
      result += chars[bytes[i] % chars.length];
    }
    return result;
  };
  return `MP-${segment()}-${segment()}-${segment()}-${segment()}`;
}
