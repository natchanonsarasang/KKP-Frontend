/**
 * Masks a phone number for privacy/security display
 * Shows first 3 digits + masked middle + last 2 digits
 * e.g., "0891234567" -> "089-****-67"
 */
export function maskPhoneNumber(phone: string): string {
  if (!phone) return "";
  
  // Remove any non-digit characters for processing
  const digits = phone.replace(/\D/g, "");
  
  if (digits.length < 6) {
    // Too short to mask meaningfully, mask all but last 2
    return "*".repeat(Math.max(0, digits.length - 2)) + digits.slice(-2);
  }
  
  // Show first 3, mask middle, show last 2
  const first = digits.slice(0, 3);
  const last = digits.slice(-2);
  const middleLength = digits.length - 5;
  const masked = "*".repeat(middleLength);
  
  // Format nicely: 089-****-67
  return `${first}-${masked}-${last}`;
}

/**
 * Masks a license plate for privacy/security display
 * Shows first 2 chars + masked middle + last 2 chars
 * e.g., "กข1234" -> "กข**34"
 */
export function maskLicensePlate(plate: string): string {
  if (!plate) return "";
  
  const trimmed = plate.trim();
  if (trimmed.length <= 4) {
    // Too short to mask meaningfully
    return trimmed.slice(0, 1) + "*".repeat(Math.max(0, trimmed.length - 2)) + trimmed.slice(-1);
  }
  
  // Show first 2, mask middle, show last 2
  const first = trimmed.slice(0, 2);
  const last = trimmed.slice(-2);
  const middleLength = trimmed.length - 4;
  const masked = "*".repeat(middleLength);
  
  return `${first}${masked}${last}`;
}

/**
 * Check if a field key is a license plate field
 */
export function isLicensePlateField(key: string): boolean {
  const lower = key.toLowerCase();
  return lower.includes("license") || lower.includes("plate") || lower === "licenseplate";
}

/**
 * Returns the full phone number (for operations that need it)
 * This is just a pass-through but makes intent clear in code
 */
export function getFullPhoneNumber(phone: string): string {
  return phone;
}
