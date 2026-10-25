import { describe, it, expect } from 'vitest';
import {
  robustParseFloat,
  cleanSelectionArray,
  normalizePhoneNumber,
  formatCurrency,
} from '../utils';

describe('robustParseFloat', () => {
  it('should parse valid numbers and numeric strings', () => {
    expect(robustParseFloat(42)).toBe(42);
    expect(robustParseFloat(3.14159)).toBe(3.14159);
    expect(robustParseFloat('100')).toBe(100);
    expect(robustParseFloat('99.99')).toBe(99.99);
  });

  it('should handle currency symbols, commas, and whitespace', () => {
    expect(robustParseFloat(' $1,234.56 ')).toBe(1234.56);
    expect(robustParseFloat('₹ 12,500.00')).toBe(12500);
    expect(robustParseFloat('€ 50')).toBe(50);
    expect(robustParseFloat(' -1,500.25 ')).toBe(-1500.25);
  });

  it('should return fallback for invalid inputs, null, and undefined', () => {
    expect(robustParseFloat(null)).toBe(0);
    expect(robustParseFloat(undefined)).toBe(0);
    expect(robustParseFloat('')).toBe(0);
    expect(robustParseFloat('abc')).toBe(0);
    expect(robustParseFloat('   ')).toBe(0);
    expect(robustParseFloat(NaN)).toBe(0);
    expect(robustParseFloat(Infinity)).toBe(0);
  });

  it('should support custom fallback values', () => {
    expect(robustParseFloat(null, 10)).toBe(10);
    expect(robustParseFloat('invalid', -1)).toBe(-1);
    expect(robustParseFloat('', 50)).toBe(50);
  });
});

describe('cleanSelectionArray', () => {
  it('should filter out empty, null, undefined, and whitespace-only strings', () => {
    const input = ['Car Washing', '', null, '  ', undefined, 'Tyre Replacement'];
    expect(cleanSelectionArray(input)).toEqual(['Car Washing', 'Tyre Replacement']);
  });

  it('should trim string items in array', () => {
    const input = ['  Car Washing  ', ' Battery Replacement '];
    expect(cleanSelectionArray(input)).toEqual(['Car Washing', 'Battery Replacement']);
  });

  it('should deduplicate entries while preserving initial order', () => {
    const input = ['Car Washing', 'Tyre Replacement', 'Car Washing', '  Tyre Replacement  '];
    expect(cleanSelectionArray(input)).toEqual(['Car Washing', 'Tyre Replacement']);
  });

  it('should return empty array for non-array or null/undefined inputs', () => {
    expect(cleanSelectionArray(null)).toEqual([]);
    expect(cleanSelectionArray(undefined)).toEqual([]);
    expect(cleanSelectionArray('not an array')).toEqual([]);
    expect(cleanSelectionArray(123)).toEqual([]);
    expect(cleanSelectionArray({})).toEqual([]);
  });

  it('should handle numbers or booleans inside array by converting to string', () => {
    const input = ['Service 1', 100, true, null];
    expect(cleanSelectionArray(input)).toEqual(['Service 1', '100', 'true']);
  });
});

describe('normalizePhoneNumber', () => {
  it('should extract 10-digit phone number from various formats', () => {
    expect(normalizePhoneNumber('+91 98765 43210')).toBe('9876543210');
    expect(normalizePhoneNumber('987-654-3210')).toBe('9876543210');
    expect(normalizePhoneNumber('(987) 654-3210')).toBe('9876543210');
    expect(normalizePhoneNumber('9876543210')).toBe('9876543210');
  });

  it('should return empty string for null, undefined, or empty values', () => {
    expect(normalizePhoneNumber(null)).toBe('');
    expect(normalizePhoneNumber(undefined)).toBe('');
    expect(normalizePhoneNumber('')).toBe('');
  });
});

describe('formatCurrency', () => {
  it('should format numbers into INR currency format', () => {
    const result = formatCurrency(1500);
    expect(result).toContain('1,500');
  });

  it('should handle string or dirty numeric inputs gracefully', () => {
    const result = formatCurrency('₹ 2,500.50');
    expect(result).toContain('2,500.5');
  });

  it('should format invalid or empty values as zero currency', () => {
    const result = formatCurrency(null);
    expect(result).toContain('0');
  });
});
