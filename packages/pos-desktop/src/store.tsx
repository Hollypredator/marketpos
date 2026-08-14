import React, {
  createContext,
  type Dispatch,
  type ReactNode,
  useContext,
  useReducer,
} from 'react';
import {
  calculateLineTotal,
  calculateVatFromTotal,
  formatCurrency,
  type PaymentMethod,
  type VatRate,
  type Campaign,
} from '@marketpos/shared';

import { calculateCampaignDiscount } from './services/campaign-logic';

import type {
  CachedCategoryRecord,
  CachedProductRecord,
  CachedBundleRecord,
} from './electron-api';
import { calculateBundleDiscounts } from './services/bundle-logic';
import type { AuthSession, TouchDensity, UiPreset } from './services/types';

export interface CartItem {
  barcode: string;
  lineTotal: number;
  name: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  discountAmount?: number;
  campaignDiscount?: number;
  campaign?: Campaign | Record<string, unknown> | null;
  isCompliment?: boolean;
}

export interface SuspendedCart {
  id: string;
  cart: CartItem[];
  customerId: string | null;
  customerName: string | null;
  timestamp: number;
}

export interface PaymentEntry {
  amount: number;
  method: PaymentMethod;
}

export interface AppUser {
  branchId: string | null;
  companyId: string;
  fullName: string;
  id: string;
  role: string;
  username: string;
}

export interface Toast {
  id: string;
  message: string;
  type: 'error' | 'info' | 'success';
}

export interface AppState {
  accessToken: string | null;
  activeCustomerId: string | null;
  activeCustomerName: string | null;
  activeCustomerTier: 'RETAIL' | 'WHOLESALE';
  cart: CartItem[];
  cartDiscountAmount: number;
  categories: CachedCategoryRecord[];
  bundles: CachedBundleRecord[];
  isOnline: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: 'DEGRADED' | 'IDLE' | 'OK';
  pendingCount: number;
  payments: PaymentEntry[];
  products: CachedProductRecord[];
  queueRefunds: number;
  queueSales: number;
  refreshToken: string | null;
  registerId: string | null;
  sessionId: string | null;
  suspendedCarts: SuspendedCart[];
  touchDensity: TouchDensity;
  toasts: Toast[];
  uiPreset: UiPreset;
  user: AppUser | null;
}

type Action =
  | { type: 'SET_SESSION'; payload: AuthSession }
  | { type: 'CLEAR_SESSION' }
  | {
      type: 'SET_CATALOG';
      payload: {
        bundles?: CachedBundleRecord[];
        categories: CachedCategoryRecord[];
        products: CachedProductRecord[];
      };
    }
  | {
      type: 'SET_QUEUE_STATUS';
      payload: {
        lastSyncStatus?: 'DEGRADED' | 'IDLE' | 'OK';
        lastSyncedAt?: string | null;
        pendingCount?: number;
        refunds: number;
        sales: number;
      };
    }
  | { type: 'SET_LAST_SYNC_AT'; payload: string | null }
  | { type: 'SET_ONLINE'; payload: boolean }
  | { type: 'SET_UI_CONFIG'; payload: { touchDensity: TouchDensity; uiPreset: UiPreset } }
  | {
      type: 'ADD_TO_CART';
      payload: {
        barcode: string;
        name: string;
        productId: string;
        unitPrice: number;
        vatRate: number;
        quantity?: number;
        campaign?: Campaign | Record<string, unknown> | null;
      };
    }
  | { type: 'UPDATE_QTY'; payload: { productId: string; quantity: number } }
  | { type: 'REMOVE_FROM_CART'; payload: { productId: string } }
  | { type: 'CLEAR_CART' }
  | { type: 'ADD_PAYMENT'; payload: PaymentEntry }
  | { type: 'CLEAR_PAYMENTS' }
  | { type: 'ADD_TOAST'; payload: Toast }
  | { type: 'REMOVE_TOAST'; payload: string }
  | { type: 'APPLY_ITEM_DISCOUNT'; payload: { productId: string; discountAmount: number } }
  | { type: 'TOGGLE_ITEM_COMPLIMENT'; payload: { productId: string } }
  | { type: 'SET_CART_DISCOUNT'; payload: number    }
  | {
      type: 'SET_PRODUCT_CAMPAIGN';
      payload: { productId: string; campaign: Campaign | null };
    }
  | { type: 'SET_CUSTOMER'; payload: { customerId: string | null; customerName: string | null; priceTier?: 'RETAIL' | 'WHOLESALE' } }
  | { type: 'SUSPEND_CURRENT_CART' }
  | { type: 'RESTORE_SUSPENDED_CART'; payload: { id: string } }
  | { type: 'DELETE_SUSPENDED_CART'; payload: { id: string } };

const initialState: AppState = {
  accessToken: null,
  activeCustomerId: null,
  activeCustomerName: null,
  activeCustomerTier: 'RETAIL',
  cart: [],
  cartDiscountAmount: 0,
  categories: [],
  bundles: [],
  isOnline: true,
  lastSyncAt: null,
  lastSyncStatus: 'IDLE',
  pendingCount: 0,
  payments: [],
  products: [],
  queueRefunds: 0,
  queueSales: 0,
  refreshToken: null,
  registerId: null,
  sessionId: null,
  suspendedCarts: [],
  touchDensity: 'comfortable',
  toasts: [],
  uiPreset: 'market',
  user: null,
};

function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_SESSION':
      return {
        ...state,
        accessToken: action.payload.accessToken,
        isOnline: action.payload.isOnline,
        refreshToken: action.payload.refreshToken,
        registerId: action.payload.registerId,
        sessionId: action.payload.sessionId,
        user: action.payload.user,
      };
    case 'CLEAR_SESSION':
      return {
        ...initialState,
      };
    case 'SET_CATALOG':
      return {
        ...state,
        categories: action.payload.categories,
        products: action.payload.products,
        bundles: action.payload.bundles || [],
      };
    case 'SET_QUEUE_STATUS':
      return {
        ...state,
        lastSyncAt:
          typeof action.payload.lastSyncedAt === 'string' || action.payload.lastSyncedAt === null
            ? action.payload.lastSyncedAt
            : state.lastSyncAt,
        lastSyncStatus: action.payload.lastSyncStatus ?? state.lastSyncStatus,
        pendingCount:
          typeof action.payload.pendingCount === 'number'
            ? action.payload.pendingCount
            : action.payload.sales + action.payload.refunds,
        queueRefunds: action.payload.refunds,
        queueSales: action.payload.sales,
      };
    case 'SET_LAST_SYNC_AT':
      return {
        ...state,
        lastSyncAt: action.payload,
      };
    case 'SET_ONLINE':
      return {
        ...state,
        isOnline: action.payload,
      };
    case 'SET_UI_CONFIG':
      return {
        ...state,
        touchDensity: action.payload.touchDensity,
        uiPreset: action.payload.uiPreset,
      };
    case 'SET_PRODUCT_CAMPAIGN':
      return {
        ...state,
        products: state.products.map((p) =>
          p.id === action.payload.productId
            ? {
                ...p,
                campaign: action.payload.campaign
                  ? (action.payload.campaign as unknown as Record<string, unknown>)
                  : null,
              }
            : p,
        ),
      };
    case 'ADD_TO_CART': {
      const existing = state.cart.find((item) => item.productId === action.payload.productId);
      const addedQty = action.payload.quantity ?? 1;
      
      // Determine base unit price (Tier-aware)
      const baseProduct = state.products.find(p => p.id === action.payload.productId);
      const isWholesale = state.activeCustomerTier === 'WHOLESALE';
      const effectiveUnitPrice = (isWholesale && baseProduct?.wholesalePrice) 
        ? baseProduct.wholesalePrice 
        : action.payload.unitPrice;

      if (existing) {
        return {
          ...state,
          cart: state.cart.map((item) => {
            if (item.productId === action.payload.productId) {
              const nextQty = item.quantity + addedQty;
              const manualDiscount = item.discountAmount || 0;
              const campaignDiscount = calculateCampaignDiscount(nextQty, effectiveUnitPrice, item.campaign);
              const totalLineDiscount = manualDiscount + campaignDiscount;

              return {
                ...item,
                unitPrice: effectiveUnitPrice,
                quantity: nextQty,
                campaignDiscount,
                lineTotal: item.isCompliment ? 0 : calculateLineTotal(nextQty, effectiveUnitPrice, totalLineDiscount),
              };
            }
            return item;
          }),
        };
      }
      const initialQty = action.payload.quantity ?? 1;
      const initialCampaignDiscount = calculateCampaignDiscount(initialQty, effectiveUnitPrice, (action.payload as any).campaign);
      return {
        ...state,
        cart: [
          ...state.cart,
          {
            ...action.payload,
            unitPrice: effectiveUnitPrice,
            lineTotal: calculateLineTotal(initialQty, effectiveUnitPrice, initialCampaignDiscount),
            quantity: initialQty,
            campaignDiscount: initialCampaignDiscount,
            campaign: (action.payload as any).campaign,
          },
        ],
      };
    }
    case 'UPDATE_QTY':
      if (action.payload.quantity <= 0) {
        return {
          ...state,
          cart: state.cart.filter((item) => item.productId !== action.payload.productId),
        };
      }
      return {
        ...state,
        cart: state.cart.map((item) => {
          if (item.productId === action.payload.productId) {
            const nextQty = action.payload.quantity;
            const manualDiscount = item.discountAmount || 0;
            const campaignDiscount = calculateCampaignDiscount(nextQty, item.unitPrice, item.campaign);
            const totalLineDiscount = manualDiscount + campaignDiscount;

            return {
              ...item,
              quantity: nextQty,
              campaignDiscount,
              lineTotal: item.isCompliment ? 0 : calculateLineTotal(nextQty, item.unitPrice, totalLineDiscount),
            };
          }
          return item;
        }),
      };
    case 'REMOVE_FROM_CART':
      return {
        ...state,
        cart: state.cart.filter((item) => item.productId !== action.payload.productId),
      };
    case 'CLEAR_CART':
      return {
        ...state,
        cart: [],
        payments: [],
        activeCustomerId: null,
        activeCustomerName: null,
        activeCustomerTier: 'RETAIL',
        cartDiscountAmount: 0
      };
    case 'ADD_PAYMENT':
      return {
        ...state,
        payments: [...state.payments, action.payload],
      };
    case 'CLEAR_PAYMENTS':
      return {
        ...state,
        payments: [],
      };
    case 'ADD_TOAST':
      return {
        ...state,
        toasts: [...state.toasts, action.payload],
      };
    case 'REMOVE_TOAST':
      return {
        ...state,
        toasts: state.toasts.filter((toast) => toast.id !== action.payload),
      };
    case 'APPLY_ITEM_DISCOUNT':
      return {
        ...state,
        cart: state.cart.map((item) => {
          if (item.productId === action.payload.productId) {
            const gross = item.quantity * item.unitPrice;
            const safeManualDiscount = Math.max(0, Math.min(gross, action.payload.discountAmount));
            const campaignDiscount = item.campaignDiscount || 0;
            const totalLineDiscount = safeManualDiscount + campaignDiscount;

            return {
              ...item,
              discountAmount: safeManualDiscount,
              lineTotal: item.isCompliment ? 0 : calculateLineTotal(item.quantity, item.unitPrice, totalLineDiscount),
            };
          }
          return item;
        }),
      };
    case 'TOGGLE_ITEM_COMPLIMENT':
      return {
        ...state,
        cart: state.cart.map((item) => {
          if (item.productId === action.payload.productId) {
            const nextCompliment = !item.isCompliment;
            const manualDiscount = item.discountAmount || 0;
            const campaignDiscount = item.campaignDiscount || 0;
            const totalLineDiscount = manualDiscount + campaignDiscount;

            return {
              ...item,
              isCompliment: nextCompliment,
              lineTotal: nextCompliment ? 0 : calculateLineTotal(item.quantity, item.unitPrice, totalLineDiscount),
            };
          }
          return item;
        }),
      };
    case 'SET_CART_DISCOUNT':
      return { ...state, cartDiscountAmount: action.payload };
    case 'SET_CUSTOMER': {
      const isWholesale = action.payload.priceTier === 'WHOLESALE';
      
      // If switching tiers, we need to refresh existing cart unit prices
      const updatedCart = state.cart.map(item => {
        const prod = state.products.find(p => p.id === item.productId);
        const newPrice = (isWholesale && prod?.wholesalePrice) ? prod.wholesalePrice : (prod?.salePrice || item.unitPrice);
        
        const manualDiscount = item.discountAmount || 0;
        const campaignDiscount = calculateCampaignDiscount(item.quantity, newPrice, item.campaign);
        
        return {
          ...item,
          unitPrice: newPrice,
          campaignDiscount,
          lineTotal: item.isCompliment ? 0 : calculateLineTotal(item.quantity, newPrice, manualDiscount + campaignDiscount)
        };
      });

      return { 
        ...state, 
        activeCustomerId: action.payload.customerId, 
        activeCustomerName: action.payload.customerName,
        activeCustomerTier: action.payload.priceTier || 'RETAIL',
        cart: updatedCart
      };
    }
    case 'SUSPEND_CURRENT_CART':
      if (state.cart.length === 0) return state;
      return {
        ...state,
        suspendedCarts: [
          ...state.suspendedCarts,
          {
            id: Date.now().toString(),
            cart: state.cart,
            customerId: state.activeCustomerId,
            customerName: state.activeCustomerName,
            timestamp: Date.now(),
          },
        ],
        cart: [],
        activeCustomerId: null,
        activeCustomerName: null,
        cartDiscountAmount: 0,
        payments: [],
      };
    case 'RESTORE_SUSPENDED_CART': {
      const suspended = state.suspendedCarts.find(c => c.id === action.payload.id);
      if (!suspended) return state;
      return {
        ...state,
        cart: suspended.cart,
        activeCustomerId: suspended.customerId,
        activeCustomerName: suspended.customerName,
        suspendedCarts: state.suspendedCarts.filter(c => c.id !== action.payload.id),
      };
    }
    case 'DELETE_SUSPENDED_CART':
      return {
        ...state,
        suspendedCarts: state.suspendedCarts.filter(c => c.id !== action.payload.id),
      };
    default:
      return state;
  }
}

export function getCartTotals(state: AppState) {
  let subtotal = 0;
  let totalVat = 0;
  let grossTotal = 0;
  let itemDiscountsTotal = 0;

  for (const item of state.cart) {
    const itemGross = item.quantity * item.unitPrice;
    grossTotal += itemGross;
    const manualDiscount = item.isCompliment ? itemGross : (item.discountAmount || 0);
    const campaignDiscount = item.isCompliment ? 0 : (item.campaignDiscount || 0);
    itemDiscountsTotal += manualDiscount + campaignDiscount;
    
    subtotal += item.lineTotal;
    totalVat += item.isCompliment ? 0 : calculateVatFromTotal(item.lineTotal, item.vatRate as VatRate);
  }

  const cartDiscount = state.cartDiscountAmount || 0;
  
  // Calculate Bundles (Combo Discounts)
  const bundleResult = calculateBundleDiscounts(state.cart, state.bundles);
  const bundleDiscountTotal = bundleResult.totalDiscount;

  const grandTotal = Math.max(0, subtotal - cartDiscount - bundleDiscountTotal);
  const totalDiscount = itemDiscountsTotal + cartDiscount + bundleDiscountTotal;

  return {
    cartDiscount,
    formatGrandTotal: formatCurrency(grandTotal),
    grandTotal,
    grossTotal,
    itemCount: state.cart.reduce((sum, item) => sum + item.quantity, 0),
    itemDiscountsTotal,
    bundleDiscountTotal,
    appliedBundles: bundleResult.appliedBundles,
    subtotal,
    totalDiscount,
    totalVat,
  };
}

export function selectAuthSession(state: AppState): AuthSession | null {
  if (!state.user || !state.registerId || !state.sessionId) {
    return null;
  }
  return {
    accessToken: state.accessToken,
    isOnline: state.isOnline,
    refreshToken: state.refreshToken,
    registerId: state.registerId,
    sessionId: state.sessionId,
    user: state.user,
  };
}

const AppContext = createContext<{ dispatch: Dispatch<Action>; state: AppState } | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  return <AppContext.Provider value={{ dispatch, state }}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp must be used within AppProvider');
  }
  return ctx;
}

export function useToast() {
  const { dispatch } = useApp();
  return {
    error: (message: string) => {
      const id = Date.now().toString();
      dispatch({ payload: { id, message, type: 'error' }, type: 'ADD_TOAST' });
      setTimeout(() => dispatch({ payload: id, type: 'REMOVE_TOAST' }), 4000);
    },
    info: (message: string) => {
      const id = Date.now().toString();
      dispatch({ payload: { id, message, type: 'info' }, type: 'ADD_TOAST' });
      setTimeout(() => dispatch({ payload: id, type: 'REMOVE_TOAST' }), 3000);
    },
    warn: (message: string) => {
      const id = Date.now().toString();
      dispatch({ payload: { id, message, type: 'info' }, type: 'ADD_TOAST' });
      setTimeout(() => dispatch({ payload: id, type: 'REMOVE_TOAST' }), 3500);
    },
    success: (message: string) => {
      const id = Date.now().toString();
      dispatch({ payload: { id, message, type: 'success' }, type: 'ADD_TOAST' });
      setTimeout(() => dispatch({ payload: id, type: 'REMOVE_TOAST' }), 3000);
    },
  };
}
