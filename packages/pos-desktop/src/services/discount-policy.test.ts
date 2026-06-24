import { describe, expect, it } from 'vitest';

import { parseDiscountInput } from './discount-policy';

describe('parseDiscountInput', () => {
  it('parses plain amount and comma decimal', () => {
    expect(parseDiscountInput('25', 200)).toBe(25);
    expect(parseDiscountInput('10,5', 200)).toBe(10.5);
  });

  it('parses localized thousand separators', () => {
    expect(parseDiscountInput('1.250,75', 5000)).toBe(1250.75);
    expect(parseDiscountInput('1,250.75', 5000)).toBe(1250.75);
  });

  it('parses percent in both suffix and prefix form', () => {
    expect(parseDiscountInput('10%', 200)).toBe(20);
    expect(parseDiscountInput('%10', 200)).toBe(20);
    expect(parseDiscountInput('% 12,5', 200)).toBe(25);
  });

  it('rejects invalid input', () => {
    expect(parseDiscountInput('', 200)).toBeNull();
    expect(parseDiscountInput('abc', 200)).toBeNull();
    expect(parseDiscountInput('-10', 200)).toBeNull();
  });
});

