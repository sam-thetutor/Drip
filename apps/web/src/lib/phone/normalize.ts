const E164_REGEX = /^\+[1-9]\d{7,14}$/;

/**
 * Normalize a phone input into strict E.164 form.
 * Returns null when the input cannot be normalized safely.
 */
export function normalizePhoneE164(input: string): string | null {
  if (!input) return null;

  // Keep digits and a leading plus only.
  const cleaned = input.trim().replace(/[\s\-()]/g, "");

  if (!E164_REGEX.test(cleaned)) return null;
  return cleaned;
}

export function isValidE164(input: string): boolean {
  return E164_REGEX.test(input);
}
