/** Validation rules shared by the auth screens (mirrors the design's rules). */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

export const MIN_PASSWORD = 6;
