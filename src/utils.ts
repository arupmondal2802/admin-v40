/**
 * Utility functions for data sanitation, parsing, and validation.
 */

/**
 * Safely parses a value into a floating point number.
 * Handles numbers, strings with currency symbols/commas/spaces, null, undefined, and invalid inputs.
 *
 * @param value - The input value to parse.
 * @param fallback - Optional fallback value if parsing fails (defaults to 0).
 * @returns Parsed number or fallback.
 */
export function robustParseFloat(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback;
  }

  if (typeof value === 'string') {
    // Strip common currency symbols, commas, and whitespace
    const cleaned = value.replace(/[^0-9.-]/g, '');
    if (cleaned === '' || cleaned === '-') {
      return fallback;
    }
    const parsed = parseFloat(cleaned);
    return Number.isNaN(parsed) ? fallback : parsed;
  }

  return fallback;
}

/**
 * Cleans an array of selection strings by removing empty/null/undefined items,
 * trimming strings, and deduplicating values while maintaining order.
 *
 * @param items - Array of items or unknown value.
 * @returns Array of cleaned, non-empty, unique trimmed strings.
 */
export function cleanSelectionArray(items: unknown): string[] {
  if (!Array.isArray(items)) {
    return [];
  }

  const result: string[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    if (item === null || item === undefined) continue;
    
    const str = String(item).trim();
    if (str.length > 0 && !seen.has(str)) {
      seen.add(str);
      result.push(str);
    }
  }

  return result;
}

/**
 * Normalizes a phone number to 10 digits by extracting digits and taking the last 10.
 *
 * @param phone - Raw phone number input.
 * @returns Normalized 10-digit phone string or empty string.
 */
export function normalizePhoneNumber(phone: unknown): string {
  if (!phone) return '';
  const digitsOnly = String(phone).replace(/\D/g, '');
  if (digitsOnly.length > 10) {
    return digitsOnly.slice(-10);
  }
  return digitsOnly;
}

/**
 * Formats a number as INR currency (₹).
 *
 * @param amount - Numeric amount to format.
 * @returns Formatted currency string.
 */
export function formatCurrency(amount: unknown): string {
  const numericAmount = robustParseFloat(amount, 0);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(numericAmount);
}
