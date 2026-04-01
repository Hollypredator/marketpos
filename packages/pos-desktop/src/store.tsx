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
} from '@marketpos/shared';

import type {
  CachedCategoryRecord,
  CompanyAccessSnapshot,
  CachedProductRecord,
} from './electron-api';
import type { AuthSession, TouchDensity, UiPreset } from './services/types';

export interface CartItem {
  barcode: string;
  lineTotal: number;
  name: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
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
  cart: CartItem[];
  categories: CachedCategoryRecord[];
  companyAccess: CompanyAccessSnapshot | null;
  isOnline: boolean;
  lastSyncAt: string | null;
  payments: PaymentEntry[];
  products: CachedProductRecord[];
  queueRefunds: number;
  queueSales: number;
  refreshToken: string | null;
  registerId: string | null;
  sessionId: string | null;
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
      payload: { categories: CachedCategoryRecord[]; products: CachedProductRecord[] };
    }
  | { type: 'SET_QUEUE_STATUS'; payload: { refunds: number; sales: number } }
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
      };
    }
  | { type: 'UPDATE_QTY'; payload: { productId: string; quantity: number } }
  | { type: 'REMOVE_FROM_CART'; payload: { productId: string } }
  | { type: 'CLEAR_CART' }
  | { type: 'ADD_PAYMENT'; payload: PaymentEntry }
  | { type: 'CLEAR_PAYMENTS' }
  | { type: 'ADD_TOAST'; payload: Toast }
  | { type: 'REMOVE_TOAST'; payload: string };

const initialState: AppState = {
  accessToken: null,
  cart: [],
  categories: [],
  companyAccess: null,
  isOnline: true,
  lastSyncAt: null,
  payments: [],
  products: [],
  queueRefunds: 0,
  queueSales: 0,
  refreshToken: null,
  registerId: null,
  sessionId: null,
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
        companyAccess: action.payload.companyAccess,
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
      };
    case 'SET_QUEUE_STATUS':
      return {
        ...state,
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
    case 'ADD_TO_CART': {
      const existing = state.cart.find((item) => item.productId === action.payload.productId);
      if (existing) {
        return {
          ...state,
          cart: state.cart.map((item) =>
            item.productId === action.payload.productId
              ? {
                  ...item,
                  lineTotal: calculateLineTotal(item.quantity + 1, item.unitPrice),
                  quantity: item.quantity + 1,
                }
              : item,
          ),
        };
      }
      return {
        ...state,
        cart: [
          ...state.cart,
          {
            ...action.payload,
            lineTotal: action.payload.unitPrice,
            quantity: 1,
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
        cart: state.cart.map((item) =>
          item.productId === action.payload.productId
            ? {
                ...item,
                lineTotal: calculateLineTotal(action.payload.quantity, item.unitPrice),
                quantity: action.payload.quantity,
              }
            : item,
        ),
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
    default:
      return state;
  }
}

export function getCartTotals(cart: CartItem[]) {
  let subtotal = 0;
  let totalVat = 0;
  for (const item of cart) {
    subtotal += item.lineTotal;
    totalVat += calculateVatFromTotal(item.lineTotal, item.vatRate as VatRate);
  }
  return {
    formatGrandTotal: formatCurrency(subtotal),
    grandTotal: subtotal,
    itemCount: cart.reduce((sum, item) => sum + item.quantity, 0),
    subtotal,
    totalVat,
  };
}

export function selectAuthSession(state: AppState): AuthSession | null {
  if (!state.user || !state.registerId || !state.sessionId) {
    return null;
  }
  return {
    accessToken: state.accessToken,
    companyAccess: state.companyAccess,
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
    success: (message: string) => {
      const id = Date.now().toString();
      dispatch({ payload: { id, message, type: 'success' }, type: 'ADD_TOAST' });
      setTimeout(() => dispatch({ payload: id, type: 'REMOVE_TOAST' }), 3000);
    },
  };
}
