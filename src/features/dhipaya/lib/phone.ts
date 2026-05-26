/**
 * Normalize Thai phone numbers to local 10-digit format starting with 0.
 * Accepts inputs like:
 *   "(081) 234-5678"   -> "0812345678"
 *   "+66868762647"     -> "0868762647"
 *   "66868762647"      -> "0868762647"
 *   "081-234-5678"     -> "0812345678"
 * Returns undefined if the input cannot be normalized to a plausible local number.
 */
export function normalizeThaiPhone(input?: string | null): string | undefined {
  if (!input) return undefined;
  // Keep digits only; drop "+", spaces, parens, dashes, dots
  let digits = String(input).replace(/\D/g, "");
  if (!digits) return undefined;

  // International form: 66XXXXXXXXX -> 0XXXXXXXXX
  if (digits.startsWith("66")) {
    digits = "0" + digits.slice(2);
  }

  // Some inputs may already be local but missing leading 0 (9 digits): prepend 0
  if (digits.length === 9 && !digits.startsWith("0")) {
    digits = "0" + digits;
  }

  // Valid Thai local numbers are 10 digits and start with 0
  if (digits.length !== 10 || !digits.startsWith("0")) return undefined;
  return digits;
}
