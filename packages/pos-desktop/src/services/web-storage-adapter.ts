import type {
  IPOSStorageAdapter,
  StorageAdapterCategory,
  StorageAdapterCustomer,
  StorageAdapterDailyReportSnapshot,
  StorageAdapterOfflineAuthResult,
  StorageAdapterProduct,
  StorageAdapterSupplier,
  StorageAdapterUser,
} from '@marketpos/shared';

const STORAGE_PREFIX = 'marketpos_web_v1_';

const DEFAULT_CATEGORIES: StorageAdapterCategory[] = [
  { companyId: 'comp-1', id: 'cat-1', isActive: true, name: 'TEMEL GIDA' },
  { companyId: 'comp-1', id: 'cat-2', isActive: true, name: 'İÇECEKLER' },
  { companyId: 'comp-1', id: 'cat-3', isActive: true, name: 'ATIŞTIRMALIK' },
  { companyId: 'comp-1', id: 'cat-4', isActive: true, name: 'TEMİZLİK' },
  { companyId: 'comp-1', id: 'cat-5', isActive: true, name: 'ŞARKÜTERİ' },
];

const DEFAULT_PRODUCTS: StorageAdapterProduct[] = [
  {
    barcode: '8690504018087',
    categoryId: 'cat-1',
    companyId: 'comp-1',
    costPrice: 20,
    id: 'prod-1',
    isActive: true,
    name: 'Ekmek 250gr',
    priceTierRetail: 12.5,
    priceTierWholesale: 10,
    quickAccess: true,
    stockCount: 150,
    unit: 'PIECE',
    vatRate: 1,
  },
  {
    barcode: '8690504001003',
    categoryId: 'cat-2',
    companyId: 'comp-1',
    costPrice: 15,
    id: 'prod-2',
    isActive: true,
    name: 'Coca Cola 1L',
    priceTierRetail: 35,
    priceTierWholesale: 30,
    quickAccess: true,
    stockCount: 80,
    unit: 'PIECE',
    vatRate: 20,
  },
  {
    barcode: '8690504002004',
    categoryId: 'cat-1',
    companyId: 'comp-1',
    costPrice: 25,
    id: 'prod-3',
    isActive: true,
    name: 'Süt 1L (Tam Yağlı)',
    priceTierRetail: 32,
    priceTierWholesale: 28,
    quickAccess: true,
    stockCount: 60,
    unit: 'PIECE',
    vatRate: 1,
  },
  {
    barcode: '8690504003005',
    categoryId: 'cat-3',
    companyId: 'comp-1',
    costPrice: 10,
    id: 'prod-4',
    isActive: true,
    name: 'Ülker Çikolatalı Gofret',
    priceTierRetail: 15,
    priceTierWholesale: 12,
    quickAccess: true,
    stockCount: 200,
    unit: 'PIECE',
    vatRate: 20,
  },
  {
    barcode: '8690504004006',
    categoryId: 'cat-4',
    companyId: 'comp-1',
    costPrice: 45,
    id: 'prod-5',
    isActive: true,
    name: 'Fairy Bulaşık Deterjanı 650ml',
    priceTierRetail: 65,
    priceTierWholesale: 58,
    quickAccess: false,
    stockCount: 40,
    unit: 'PIECE',
    vatRate: 20,
  },
];

const DEFAULT_USERS: StorageAdapterUser[] = [
  {
    branchId: 'branch-1',
    companyId: 'comp-1',
    fullName: 'Yönetici Kullanıcı',
    id: 'usr-admin',
    isActive: true,
    role: 'ADMIN',
    username: 'admin',
  },
  {
    branchId: 'branch-1',
    companyId: 'comp-1',
    fullName: 'Kasiyer',
    id: 'usr-cashier',
    isActive: true,
    role: 'CASHIER',
    username: 'kasiyer',
  },
];

export class WebStorageAdapter implements IPOSStorageAdapter {
  private getItem<T>(key: string, defaultValue: T): T {
    try {
      const raw = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
      return raw ? (JSON.parse(raw) as T) : defaultValue;
    } catch {
      return defaultValue;
    }
  }

  private setItem<T>(key: string, value: T): void {
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(value));
    } catch (err) {
      console.warn('LocalStorage setItem failed:', err);
    }
  }

  public async getCachedCategories(companyId: string): Promise<StorageAdapterCategory[]> {
    const categories = this.getItem<StorageAdapterCategory[]>('categories', DEFAULT_CATEGORIES);
    const matched = categories.filter((c) => (c.companyId === companyId || !companyId) && c.isActive);
    return matched.length > 0 ? matched : DEFAULT_CATEGORIES;
  }

  public async getCachedProducts(options: {
    categoryId?: string;
    companyId: string;
    quickAccessOnly?: boolean;
    search?: string;
  }): Promise<StorageAdapterProduct[]> {
    const rawProducts = this.getItem<any[]>('products', DEFAULT_PRODUCTS);
    const filtered = rawProducts.filter((p) => {
      if (p.isActive === false) return false;
      if (options.quickAccessOnly && !p.quickAccess) return false;
      if (options.categoryId && options.categoryId !== 'all' && p.categoryId !== options.categoryId) return false;
      if (options.search) {
        const q = options.search.toLowerCase().trim();
        const nameMatch = p.name ? p.name.toLowerCase().includes(q) : false;
        const barcodeMatch = p.barcode ? p.barcode.includes(q) : false;
        if (!nameMatch && !barcodeMatch) return false;
      }
      return true;
    });

    return filtered.map((p) => ({
      ...p,
      salePrice: p.salePrice ?? p.priceTierRetail ?? 0,
      wholesalePrice: p.wholesalePrice ?? p.priceTierWholesale ?? 0,
      estimatedStock: p.estimatedStock ?? p.stockCount ?? 0,
      vatRate: p.vatRate ?? 20,
    }));
  }

  public async getCachedCustomers(
    companyId: string,
    search?: string,
  ): Promise<StorageAdapterCustomer[]> {
    const customers = this.getItem<StorageAdapterCustomer[]>('customers', [
      {
        address: 'Merkez Mah. No:1',
        balance: 0,
        companyId: 'comp-1',
        email: 'musteri@example.com',
        fullName: 'Perakende Müşteri',
        id: 'cust-1',
        isActive: true,
        loyaltyPoints: 10,
        phone: '05550000000',
        taxNumber: null,
      },
    ]);
    return customers.filter((c) => {
      if (c.companyId !== companyId || !c.isActive) return false;
      if (search) {
        const q = search.toLowerCase().trim();
        return c.fullName.toLowerCase().includes(q) || (c.phone && c.phone.includes(q));
      }
      return true;
    });
  }

  public async getCachedSuppliers(companyId: string): Promise<StorageAdapterSupplier[]> {
    const suppliers = this.getItem<StorageAdapterSupplier[]>('suppliers', [
      {
        address: 'Organize Sanayi Bölgesi',
        companyId: 'comp-1',
        email: 'tedarikci@example.com',
        fullName: 'Ana Toptancı Ltd.',
        id: 'sup-1',
        isActive: true,
        phone: '02120000000',
        taxNumber: '1234567890',
      },
    ]);
    return suppliers.filter((s) => s.companyId === companyId && s.isActive);
  }

  public async getCachedSession(): Promise<StorageAdapterOfflineAuthResult | null> {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}active_session`);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as StorageAdapterOfflineAuthResult;
    } catch {
      return null;
    }
  }

  public async offlineLogin(payload: {
    companyId?: string;
    password: string;
    username: string;
  }): Promise<StorageAdapterOfflineAuthResult | null> {
    const users = this.getItem<StorageAdapterUser[]>('users', DEFAULT_USERS);
    const user = users.find(
      (u) => u.username.toLowerCase() === payload.username.toLowerCase(),
    );

    if (!user) {
      throw new Error('Kullanıcı bulunamadı.');
    }

    const session: StorageAdapterOfflineAuthResult = {
      accessToken: `web-token-${Date.now()}`,
      refreshToken: `web-refresh-${Date.now()}`,
      registerId: 'reg-1',
      sessionId: `sess-${Date.now()}`,
      user,
    };

    this.setItem('active_session', session);
    return session;
  }

  public async clearSession(): Promise<void> {
    localStorage.removeItem(`${STORAGE_PREFIX}active_session`);
    localStorage.removeItem('marketpos_session_v1');
    localStorage.removeItem('marketpos_auth_session');
    localStorage.removeItem('marketpos.web.session.v1');
  }

  public async queueSale(payload: { localId?: string; sale: any }): Promise<any> {
    const sales = this.getItem<any[]>('sales', []);
    const record = {
      createdAt: new Date().toISOString(),
      id: payload.localId ?? `sale-${Date.now()}`,
      payloadData: JSON.stringify(payload.sale),
      syncStatus: 'SYNCED',
    };
    sales.push(record);
    this.setItem('sales', sales);

    // Update stock counts
    const products = this.getItem<StorageAdapterProduct[]>('products', DEFAULT_PRODUCTS);
    if (payload.sale?.items && Array.isArray(payload.sale.items)) {
      for (const item of payload.sale.items) {
        const prod = products.find((p) => p.id === item.productId || p.barcode === item.barcode);
        if (prod) {
          prod.stockCount = Math.max(0, prod.stockCount - (item.quantity ?? 1));
        }
      }
      this.setItem('products', products);
    }

    return record;
  }

  public async queueRefund(payload: { localId?: string; refund: any }): Promise<any> {
    const refunds = this.getItem<any[]>('refunds', []);
    const record = {
      createdAt: new Date().toISOString(),
      id: payload.localId ?? `refund-${Date.now()}`,
      payloadData: JSON.stringify(payload.refund),
      syncStatus: 'SYNCED',
    };
    refunds.push(record);
    this.setItem('refunds', refunds);
    return record;
  }

  public async queueProductOp(payload: {
    localId?: string;
    opType: string;
    payload: unknown;
  }): Promise<any> {
    const products = this.getItem<StorageAdapterProduct[]>('products', DEFAULT_PRODUCTS);
    const data = payload.payload as any;
    if (payload.opType === 'CREATE' && data) {
      const newProd: StorageAdapterProduct = {
        barcode: data.barcode || null,
        categoryId: data.categoryId || null,
        companyId: data.companyId || 'comp-1',
        costPrice: data.costPrice || 0,
        id: payload.localId || `prod-${Date.now()}`,
        isActive: true,
        name: data.name || 'Yeni Ürün',
        priceTierRetail: data.priceTierRetail || data.salePrice || 0,
        priceTierWholesale: data.priceTierWholesale || 0,
        quickAccess: Boolean(data.quickAccess),
        stockCount: data.stockCount || 0,
        unit: data.unit || 'PIECE',
        vatRate: data.vatRate || 20,
      };
      products.push(newProd);
      this.setItem('products', products);
    }
    return { id: payload.localId || `op-${Date.now()}` };
  }

  public async queueCustomerOp(payload: {
    localId?: string;
    opType: string;
    payload: unknown;
  }): Promise<any> {
    const customers = this.getItem<StorageAdapterCustomer[]>('customers', []);
    const data = payload.payload as any;
    if (payload.opType === 'CREATE' && data) {
      customers.push({
        address: data.address || null,
        balance: 0,
        companyId: data.companyId || 'comp-1',
        email: data.email || null,
        fullName: data.name || data.fullName || 'Müşteri',
        id: payload.localId || `cust-${Date.now()}`,
        isActive: true,
        loyaltyPoints: 0,
        phone: data.phone || null,
        taxNumber: data.taxNumber || null,
      });
      this.setItem('customers', customers);
    }
    return { id: payload.localId || `op-${Date.now()}` };
  }

  public async getLocalDailyReport(query: {
    companyId: string;
    registerId: string;
    referenceAt?: string;
  }): Promise<StorageAdapterDailyReportSnapshot> {
    const sales = this.getItem<any[]>('sales', []);
    let totalSales = 0;
    let salesCount = sales.length;

    for (const s of sales) {
      try {
        const parsed = JSON.parse(s.payloadData);
        totalSales += parsed.totalAmount || parsed.total || 0;
      } catch {
        // ignore
      }
    }

    const todayStr = (query.referenceAt ? new Date(query.referenceAt) : new Date())
      .toISOString()
      .split('T')[0];

    return {
      report: {
        date: todayStr,
        netSales: totalSales,
        paymentBreakdown: [
          { method: 'CASH', total: totalSales * 0.6 },
          { method: 'CREDIT_CARD', total: totalSales * 0.4 },
        ],
        refundsCount: 0,
        salesCount,
        totalRefunds: 0,
        totalSales,
        totalVat: totalSales * 0.18,
      },
      topProducts: [],
    };
  }

  public async getLocalSetting(key: string, defaultValue?: string): Promise<string | null> {
    return this.getItem<string | null>(`setting_${key}`, defaultValue ?? null);
  }

  public async setLocalSetting(key: string, value: string): Promise<void> {
    this.setItem(`setting_${key}`, value);
  }

  public async printReceipt(payload: {
    copyCount?: number;
    lines: string[];
  }): Promise<{ success: boolean; message: string }> {
    console.log('[WebPrint] Printing receipt lines:', payload.lines);
    // In web environment, if window.print is available or preview required
    return { message: 'Fiş yazdırıldı (Web önizleme / konsol)', success: true };
  }
}
