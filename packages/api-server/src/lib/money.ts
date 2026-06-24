type MaybeMinor = bigint | number | null | undefined;

export function toMinor(value: number): bigint {
  if (!Number.isFinite(value)) {
    return 0n;
  }
  return BigInt(Math.round(value * 100));
}

export function fromMinor(value: MaybeMinor): number {
  if (typeof value === 'bigint') {
    return Number(value) / 100;
  }
  if (typeof value === 'number') {
    return value / 100;
  }
  return 0;
}

export function moneyFromMinorOrFloat(floatValue: number | null | undefined, minorValue: MaybeMinor): number {
  if (typeof minorValue === 'bigint' || typeof minorValue === 'number') {
    const fromMinorValue = fromMinor(minorValue);
    if (
      fromMinorValue === 0 &&
      typeof floatValue === 'number' &&
      Number.isFinite(floatValue) &&
      floatValue !== 0
    ) {
      return floatValue;
    }
    return fromMinorValue;
  }
  return typeof floatValue === 'number' ? floatValue : 0;
}

export function roundMoney(value: number): number {
  return Number(value.toFixed(2));
}
