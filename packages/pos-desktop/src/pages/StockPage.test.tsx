// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import StockPage from './StockPage';

const mockedRuntime = vi.hoisted(() => ({
  createProduct: vi.fn(),
  createStockMovement: vi.fn(),
  explainRuntimeError: vi.fn(() => 'runtime-error'),
  fetchStockLevels: vi.fn(),
  loadCatalog: vi.fn(async () => ({ categories: [], products: [] })),
  logSecurityEvent: vi.fn(),
  updateProduct: vi.fn(),
}));

const mockedStore = vi.hoisted(() => ({
  dispatch: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  state: {
    accessToken: 'token',
    activeCustomerId: null,
    activeCustomerName: null,
    cart: [],
    cartDiscountAmount: 0,
    categories: [
      {
        color: null,
        companyId: 'cmp-1',
        id: 'cat-clean',
        name: 'Temizlik',
        parentId: null,
        sortOrder: 0,
      },
    ],
    companyAccess: null,
    isOnline: true,
    lastSyncAt: null,
    payments: [],
    products: [
      {
        barcode: '100',
        categoryId: 'cat-clean',
        companyId: 'cmp-1',
        id: 'prd-1',
        isActive: true,
        isQuickAccess: false,
        name: 'ABC Deterjan',
        quickAccessColor: null,
        quickAccessOrder: null,
        salePrice: 129.9,
        vatRate: 20,
      },
      {
        barcode: '101',
        categoryId: 'cat-clean',
        companyId: 'cmp-1',
        id: 'prd-2',
        isActive: true,
        isQuickAccess: true,
        name: 'XYZ Sabun',
        quickAccessColor: null,
        quickAccessOrder: 1,
        salePrice: 69.9,
        vatRate: 10,
      },
    ],
    queueRefunds: 0,
    queueSales: 0,
    refreshToken: null,
    registerId: 'reg-1',
    sessionId: 'ses-1',
    suspendedCarts: [],
    touchDensity: 'comfortable',
    toasts: [],
    uiPreset: 'market',
    user: {
      branchId: 'br-1',
      companyId: 'cmp-1',
      fullName: 'Test User',
      id: 'usr-1',
      role: 'ADMIN',
      username: 'admin',
    },
  },
  success: vi.fn(),
}));

vi.mock('../services/pos-runtime', () => mockedRuntime);
vi.mock('../store', () => ({
  selectAuthSession: vi.fn(() => ({
    accessToken: 'token',
    companyAccess: null,
    isOnline: true,
    refreshToken: null,
    registerId: 'reg-1',
    sessionId: 'ses-1',
    user: mockedStore.state.user,
  })),
  useApp: () => ({ dispatch: mockedStore.dispatch, state: mockedStore.state }),
  useToast: () => ({
    error: mockedStore.error,
    info: mockedStore.info,
    success: mockedStore.success,
  }),
}));

function installLocalStorageMock() {
  const store = new Map<string, string>();
  const localStorageMock: Storage = {
    clear: () => {
      store.clear();
    },
    getItem: (key: string) => (store.has(key) ? store.get(key) ?? null : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: localStorageMock,
    writable: true,
  });
}

describe('StockPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installLocalStorageMock();
    mockedRuntime.fetchStockLevels.mockResolvedValue([
      {
        branchId: 'br-1',
        id: 'st-1',
        product: {
          barcode: '100',
          id: 'prd-1',
          isActive: true,
          minStock: 2,
          name: 'ABC Deterjan',
          salePrice: 129.9,
        },
        productId: 'prd-1',
        quantity: 0,
        updatedAt: '2026-04-16T10:00:00.000Z',
      },
      {
        branchId: 'br-1',
        id: 'st-2',
        product: {
          barcode: '101',
          id: 'prd-2',
          isActive: true,
          minStock: 3,
          name: 'XYZ Sabun',
          salePrice: 69.9,
        },
        productId: 'prd-2',
        quantity: 8,
        updatedAt: '2026-04-16T10:00:00.000Z',
      },
    ]);
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('uses neo as default variant and persists toggle to localStorage', async () => {
    const user = userEvent.setup();
    render(<StockPage />);

    const toggle = await screen.findByTestId('stock-ui-variant-toggle');
    expect(toggle.textContent).toContain('Klasik Görünüm');
    expect(window.localStorage.getItem('stock_ui_variant')).toBe('neo');

    await user.click(toggle);

    expect(window.localStorage.getItem('stock_ui_variant')).toBe('classic');
    expect(toggle.textContent).toContain('Yeni Görünüm');
  });

  it('opens and closes product drawer from product list row', async () => {
    const user = userEvent.setup();
    render(<StockPage />);

    const editButton = await screen.findByTestId('edit-product-prd-1');
    await user.click(editButton);

    expect(screen.getByTestId('stock-product-drawer')).not.toBeNull();
    expect(screen.getByText('Secili urun: ABC Deterjan')).not.toBeNull();

    await user.click(screen.getByRole('button', { name: 'Kapat' }));

    await waitFor(() => {
      expect(screen.queryByTestId('stock-product-drawer')).toBeNull();
    });
  });

  it('applies product and stock filters without breaking list rendering', async () => {
    const user = userEvent.setup();
    render(<StockPage />);

    await screen.findByText('ABC Deterjan');

    const searchInputs = screen.getAllByPlaceholderText(/ara/i);
    await user.type(searchInputs[0] as HTMLInputElement, 'XYZ');
    const productListSection = screen
      .getByRole('heading', { name: 'Ürün Listesi' })
      .closest('.stock-section') as HTMLElement | null;
    if (!productListSection) {
      throw new Error('product list section not found');
    }
    expect(within(productListSection).queryByText('ABC Deterjan')).toBeNull();
    expect(within(productListSection).getByText('XYZ Sabun')).not.toBeNull();
    expect(within(productListSection).getByText(/Sayfa 1\/1/i)).not.toBeNull();

    await user.selectOptions(screen.getByDisplayValue('Tüm kayıtlar'), 'OUT');
    expect(screen.getByText('ABC Deterjan')).not.toBeNull();
  });
});
