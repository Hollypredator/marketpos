import { describe, expect, it } from 'vitest';

import { buildPendingSaleItems } from './sale-payload';

describe('buildPendingSaleItems', () => {
  it('distributes cart discount proportionally to line totals', () => {
    const items = buildPendingSaleItems(
      [
        {
          lineTotal: 80,
          productId: 'p1',
          quantity: 1,
          unitPrice: 100,
        },
        {
          lineTotal: 40,
          productId: 'p2',
          quantity: 1,
          unitPrice: 50,
        },
      ],
    );

    expect(items).toEqual([
      {
        discount: 20,
        productId: 'p1',
        quantity: 1,
        unitPrice: 100,
      },
      {
        discount: 10,
        productId: 'p2',
        quantity: 1,
        unitPrice: 50,
      },
    ]);
  });

  it('converts compliment lines into full discount', () => {
    const items = buildPendingSaleItems(
      [
        {
          isCompliment: true,
          lineTotal: 0,
          productId: 'free',
          quantity: 2,
          unitPrice: 12.5,
        },
      ],
    );

    expect(items).toEqual([
      {
        discount: 25,
        productId: 'free',
        quantity: 2,
        unitPrice: 12.5,
      },
    ]);
  });

  it('keeps discount capped at line gross amount', () => {
    const items = buildPendingSaleItems(
      [
        {
          discountAmount: 999,
          lineTotal: 5,
          productId: 'cap',
          quantity: 1,
          unitPrice: 10,
        },
      ],
    );

    expect(items).toEqual([
      {
        discount: 10,
        productId: 'cap',
        quantity: 1,
        unitPrice: 10,
      },
    ]);
  });
});
