import { formatCurrency } from '@marketpos/shared';

import type { CachedCategoryRecord, CachedProductRecord } from '../electron-api';
import type { TouchDensity, UiPreset, UiPresetDefinition } from './types';

const PRESET_KEYWORDS: Record<UiPreset, string[]> = {
  cafe: ['cay', 'cappuccino', 'espresso', 'kahve', 'latte', 'pasta', 'tatli'],
  kasap: ['et', 'kiyma', 'kofte', 'sarkuteri', 'sucuk', 'tavuk'],
  market: ['atistirmalik', 'ekmek', 'gida', 'sut', 'su', 'temizlik'],
  pide: ['doner', 'iskender', 'lahmacun', 'menu', 'pide', 'pizza'],
};

const PRESET_DEFINITIONS: Record<UiPreset, UiPresetDefinition> = {
  cafe: {
    accentColor: '#0ea5e9',
    description: 'Icecek ve tatli odakli hizli satis',
    id: 'cafe',
    label: 'Kafe',
  },
  kasap: {
    accentColor: '#dc2626',
    description: 'Et ve sarkuteri odakli satis',
    id: 'kasap',
    label: 'Kasap / Sarkuteri',
  },
  market: {
    accentColor: '#6366f1',
    description: 'Genel market ve bakkal satis duzeni',
    id: 'market',
    label: 'Market / Bakkal',
  },
  pide: {
    accentColor: '#16a34a',
    description: 'Pide ve hizli yemek odakli satis',
    id: 'pide',
    label: 'Pide / Restoran',
  },
};

function normalizeText(value: string): string {
  return value
    .toLocaleLowerCase('tr-TR')
    .replace(/\u0131/g, 'i')
    .replace(/\u011f/g, 'g')
    .replace(/\u00fc/g, 'u')
    .replace(/\u00f6/g, 'o')
    .replace(/\u015f/g, 's')
    .replace(/\u00e7/g, 'c')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function roundTo(value: number, step: number): number {
  return Math.ceil(value / step) * step;
}

export function listUiPresetDefinitions(): UiPresetDefinition[] {
  return Object.values(PRESET_DEFINITIONS);
}

export function getUiPresetDefinition(preset: UiPreset): UiPresetDefinition {
  return PRESET_DEFINITIONS[preset];
}

export function resolveTouchDensityByViewport(
  width: number,
  height: number,
): TouchDensity {
  if (width <= 1024) {
    return 'compact';
  }
  return height <= 700 ? 'compact' : 'comfortable';
}

export function getQuickAmountsByPreset(total: number, preset: UiPreset): number[] {
  const safeTotal = Math.max(0, total);
  const rounded1 = roundTo(safeTotal, 1);
  const candidates =
    preset === 'market'
      ? [rounded1, rounded1 + 5, rounded1 + 10, rounded1 + 20]
      : preset === 'cafe'
        ? [
            roundTo(safeTotal, 5),
            roundTo(safeTotal, 10),
            roundTo(safeTotal, 20),
            roundTo(safeTotal, 50),
          ]
        : preset === 'pide'
          ? [
              roundTo(safeTotal, 10),
              roundTo(safeTotal, 20),
              roundTo(safeTotal, 50),
              roundTo(safeTotal, 100),
            ]
          : [
              roundTo(safeTotal, 5),
              roundTo(safeTotal, 25),
              roundTo(safeTotal, 50),
              roundTo(safeTotal, 100),
            ];

  return candidates
    .filter((value, index) => candidates.indexOf(value) === index)
    .filter((value) => value >= safeTotal)
    .slice(0, 4);
}

export function formatPresetQuickAmounts(total: number, preset: UiPreset): string[] {
  return getQuickAmountsByPreset(total, preset).map((amount) => formatCurrency(amount));
}

function scoreProductForPreset(
  product: CachedProductRecord,
  preset: UiPreset,
  categoryName?: string,
): number {
  let score = 0;
  if (product.isQuickAccess) {
    score += 5_000;
  }
  if (typeof product.quickAccessOrder === 'number') {
    score += Math.max(0, 200 - product.quickAccessOrder);
  }

  const haystack = `${product.name} ${categoryName ?? ''} ${product.barcode}`;
  const normalized = normalizeText(haystack);
  for (const keyword of PRESET_KEYWORDS[preset]) {
    if (normalized.includes(keyword)) {
      score += 500;
    }
  }
  return score;
}

export function sortProductsByPreset(
  products: CachedProductRecord[],
  preset: UiPreset,
  categories: CachedCategoryRecord[],
): CachedProductRecord[] {
  const categoryMap = new Map(categories.map((category) => [category.id, category.name]));
  return [...products].sort((left, right) => {
    const leftScore = scoreProductForPreset(
      left,
      preset,
      left.categoryId ? categoryMap.get(left.categoryId) : undefined,
    );
    const rightScore = scoreProductForPreset(
      right,
      preset,
      right.categoryId ? categoryMap.get(right.categoryId) : undefined,
    );

    if (leftScore !== rightScore) {
      return rightScore - leftScore;
    }
    return left.name.localeCompare(right.name, 'tr');
  });
}
