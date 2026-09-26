import bcrypt from 'bcryptjs';

const PIN_PATTERN = /^\d{4,6}$/;

export function isValidPin(pin: string): boolean {
  return PIN_PATTERN.test(pin);
}

export async function hashPin(pin: string): Promise<string> {
  if (!isValidPin(pin)) throw new Error('invalid_pin_format');
  return bcrypt.hash(pin, 10);
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}
