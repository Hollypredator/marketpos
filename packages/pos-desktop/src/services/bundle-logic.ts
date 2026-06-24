import type { CartItem } from '../store';
import type { CachedBundleRecord } from '../electron-api';

export interface AppliedBundle {
  bundleId: string;
  name: string;
  count: number;
  discountPerBundle: number;
  totalBundleDiscount: number;
}

export interface BundleCalculationResult {
  appliedBundles: AppliedBundle[];
  totalDiscount: number;
}

/**
 * Scans the cart for groups of products that satisfy bundle campaign definitions.
 * Greedily applies bundles based on the order they appear in the bundles list.
 */
export function calculateBundleDiscounts(
  cart: CartItem[],
  bundles: CachedBundleRecord[]
): BundleCalculationResult {
  if (cart.length === 0 || bundles.length === 0) {
    return { appliedBundles: [], totalDiscount: 0 };
  }

  // Work with a mutable copy of product counts in the cart
  const inventory: Record<string, number> = {};
  const productPrices: Record<string, number> = {};
  
  cart.forEach(item => {
    // If it's a compliment, it shouldn't count towards a bundle trigger
    if (!item.isCompliment) {
      inventory[item.productId] = (inventory[item.productId] || 0) + item.quantity;
      productPrices[item.productId] = item.unitPrice;
    }
  });

  const appliedBundles: AppliedBundle[] = [];
  let totalDiscount = 0;

  // Iterate through active bundles
  const activeBundles = bundles.filter(b => b.isActive);

  for (const bundle of activeBundles) {
    // Check if we have all necessary products
    if (bundle.productIds.length === 0) continue;

    // A bundle might be applicable multiple times
    let possibleFullSets = Infinity;
    
    // First pass: find how many full sets we HAVE
    for (const pid of bundle.productIds) {
      const available = inventory[pid] || 0;
      if (available <= 0) {
        possibleFullSets = 0;
        break;
      }
      possibleFullSets = Math.min(possibleFullSets, available);
    }

    if (possibleFullSets > 0 && possibleFullSets !== Infinity) {
      // Calculate what these products would cost normally
      let normalPriceForSet = 0;
      for (const pid of bundle.productIds) {
        normalPriceForSet += productPrices[pid] || 0;
      }

      const discountPerBundle = Math.max(0, normalPriceForSet - bundle.bundlePrice);
      const totalBundleDiscount = discountPerBundle * possibleFullSets;

      if (totalBundleDiscount > 0) {
        appliedBundles.push({
          bundleId: bundle.id,
          name: bundle.name,
          count: possibleFullSets,
          discountPerBundle,
          totalBundleDiscount
        });

        totalDiscount += totalBundleDiscount;

        // Consume items from inventory
        for (const pid of bundle.productIds) {
          inventory[pid] -= possibleFullSets;
        }
      }
    }
  }

  return {
    appliedBundles,
    totalDiscount
  };
}
