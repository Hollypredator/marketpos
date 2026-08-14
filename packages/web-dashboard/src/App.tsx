import { useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import { AppShell } from './components/AppShell';
import { LoginView } from './components/LoginView';
import { PaymentSuccessPage } from './pages/PaymentSuccessPage';
import { useAuth } from './domain/auth/hooks';
import type { LoginFormState } from './domain/auth/types';
import { TAB_PATHS } from './lib/route-access';
import { useCategoriesQuery, useCatalogMutations, useProductsQuery } from './domain/catalog/hooks';
import type {
  BulkProductUpdateForm,
  CategoryForm,
  ProductForm,
  ProductListFilters,
} from './domain/catalog/types';
import {
  useBranchesQuery,
  useBranchMutations,
  useCompaniesQuery,
  useCompanyMutations,
  useInvoiceTemplateMutation,
  useInvoiceTemplateQuery,
} from './domain/organization/hooks';
import type {
  BranchCreateForm,
  BranchEditForm,
  CompanyCreateForm,
  CompanyEditForm,
  InvoiceTemplateForm,
} from './domain/organization/types';
import { useOperationsHealthQuery, useReportsMutation } from './domain/reports/hooks';
import type { ReportRange } from './domain/reports/types';
import { useSuppliersQuery } from './domain/suppliers/hooks';
import { useStockLevelsQuery, useStockMovementsQuery, useRegistersQuery, useStockMutations } from './domain/stock/hooks';
import type { StockMovementForm, StockMovementListFilters } from './domain/stock/types';
import {
  useProvisionTemplatesQuery,
  useSubscriptionAuditQuery,
  useSubscriptionCompaniesQuery,
  useSubscriptionMutations,
  useSystemAuditQuery,
} from './domain/subscription/hooks';
import type {
  SubscriptionFilters,
  SubscriptionPlanForm,
  SubscriptionProvisionForm,
  SubscriptionSort,
} from './domain/subscription/types';
import {
  SUBSCRIPTION_STATUSES,
  type BranchComparisonRow,
  type DailyReport,
  type ExpiringProduct,
  type LedgerSummary,
  type ProfitabilityReport,
  type ReportSession,
  type TopProduct,
} from './domain/shared/types';
import { useUsersQuery, useUserMutations } from './domain/users/hooks';
import type { UserCreateForm, UserEditForm } from './domain/users/types';
import { useTabNavigation } from './hooks/use-tab-navigation';
import { downloadCsv, intNum, money, readError, toDateInput, toDateTime, toLocalDateIso } from './lib/format';
import { canManageRole, resolveAssignableRoles } from './lib/role-hierarchy';
import { hasPermission } from './lib/permissions';
import { queryKeys } from './lib/query-keys';
import { createFlowTimer } from './lib/telemetry';
import { CatalogPage } from './pages/CatalogPage';
import { OrganizationPage } from './pages/OrganizationPage';
import { ReportsPage } from './pages/ReportsPage';
import { SetupWizardPage } from './pages/SetupWizardPage';
import { StockPage } from './pages/StockPage';
import { AuditLogPage } from './pages/AuditLogPage';
import { SubscriptionPage } from './pages/SubscriptionPage';
import { UsersPage } from './pages/UsersPage';
import { SuppliersPage } from './pages/suppliers/SuppliersPage';
import { LandingPage } from './pages/LandingPage';
import { YonetimPage } from './pages/YonetimPage';
import { StockTransfersPage } from './pages/StockTransfersPage';
import { CustomersPage } from './pages/CustomersPage';
import { SalesPage } from './pages/SalesPage';
import { DashboardPage } from './pages/DashboardPage';
import {
  useStockTransfersQuery,
  useStockTransferDetailQuery,
  useStockTransferMutations,
} from './domain/stock-transfers/hooks';
import {
  useCustomersQuery,
  useCustomerTransactionsQuery,
  useCustomerMutations,
} from './domain/customers/hooks';
import {
  useSalesQuery,
  useSaleDetailQuery,
  useRefundsQuery,
} from './domain/sales/hooks';
import type { PaginatedResponse } from './domain/shared/types';
import type { StockTransfer } from './domain/stock-transfers/api';
import type { Sale } from './domain/sales/api';

interface BannerState {
  text: string;
  type: 'error' | 'success';
}

function setOrDelete(params: URLSearchParams, key: string, value: string, fallback = ''): void {
  if (value.trim().length === 0 || value === fallback) {
    params.delete(key);
  } else {
    params.set(key, value);
  }
}

export default function App(): React.ReactElement {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const auth = useAuth();

  const [banner, setBanner] = useState<BannerState | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [loginForm, setLoginForm] = useState<LoginFormState>({
    companyId: '',
    email: '',
    mode: 'EMAIL',
    password: 'admin123',
    username: 'admin',
  });

  const onLogin = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (loginForm.mode === 'EMAIL' && loginForm.email.trim().length === 0) {
      setBanner({ type: 'error', text: 'Email ile giris modunda email zorunludur' });
      return;
    }
    if (loginForm.mode === 'LEGACY' && loginForm.username.trim().length < 3) {
      setBanner({ type: 'error', text: 'Legacy giris modunda kullanici adi zorunludur' });
      return;
    }
    setIsAuthenticating(true);
    try {
      await auth.login(loginForm);
      setBanner({ type: 'success', text: 'Giris basarili' });
      auth.clearAccessBlockedMessage();
    } catch (error: unknown) {
      setBanner({ type: 'error', text: readError(error, 'Giris basarisiz') });
    } finally {
      setIsAuthenticating(false);
    }
  };

  // LoginView wrapper for routes (provides required props)
  const RouteLoginView = React.useCallback(() => (
    <LoginView
      accessBlockedMessage={null}
      banner={null}
      login={loginForm}
      onChangeEmail={(value) => setLoginForm((current) => ({ ...current, email: value }))}
      onChangeCompanyId={(value) => setLoginForm((current) => ({ ...current, companyId: value }))}
      onChangeMode={(mode) => setLoginForm((current) => ({ ...current, mode }))}
      onChangePassword={(value) => setLoginForm((current) => ({ ...current, password: value }))}
      onChangeUsername={(value) => setLoginForm((current) => ({ ...current, username: value }))}
      onSubmit={onLogin}
      saving={isAuthenticating}
    />
  ), [loginForm, isAuthenticating, onLogin]);

  const [companyId, setCompanyId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [reportRegisterId, setReportRegisterId] = useState(() => searchParams.get('reportRegister') ?? '');
  const [subscriptionSelectedCompanyId, setSubscriptionSelectedCompanyId] = useState('');

  const today = toLocalDateIso(new Date());
  const [dailyDate, setDailyDate] = useState(() => searchParams.get('reportDate') ?? today);
  const [reportRange, setReportRange] = useState<ReportRange>(() => {
    const now = new Date();
    return {
      from: searchParams.get('reportFrom') ?? toLocalDateIso(new Date(now.getFullYear(), now.getMonth(), 1)),
      to: searchParams.get('reportTo') ?? toLocalDateIso(now),
    };
  });
  const [subscriptionFilters, setSubscriptionFilters] = useState<SubscriptionFilters>(() => ({
    dueInDays: searchParams.get('subDue') ?? '30',
    search: searchParams.get('subSearch') ?? '',
    status: (searchParams.get('subStatus') as SubscriptionFilters['status']) ?? '',
  }));
  const [appliedSubscriptionFilters, setAppliedSubscriptionFilters] = useState(subscriptionFilters);
  const [subscriptionSort, setSubscriptionSort] = useState<SubscriptionSort>(
    () => (searchParams.get('subSort') as SubscriptionSort) ?? 'DUE_ASC',
  );

  const [transferStatusFilter, setTransferStatusFilter] = useState('');
  const [selectedTransferId, setSelectedTransferId] = useState('');
  const [transferPage, setTransferPage] = useState(1);

  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerForm, setCustomerForm] = useState({ name: '', phone: '', email: '', address: '', taxNumber: '' });
  const [customerEditForm, setCustomerEditForm] = useState({ name: '', phone: '', email: '', address: '', taxNumber: '' });
  const [transactionForm, setTransactionForm] = useState<{ type: 'DEBT' | 'PAYMENT'; amount: string; description: string }>({ type: 'DEBT', amount: '', description: '' });

  const [selectedSaleId, setSelectedSaleId] = useState('');
  const [salesFrom, setSalesFrom] = useState(() => searchParams.get('salesFrom') ?? toLocalDateIso(new Date()));
  const [salesTo, setSalesTo] = useState(() => searchParams.get('salesTo') ?? toLocalDateIso(new Date()));
  const [receiptSearch, setReceiptSearch] = useState('');
  const [appliedReceiptSearch, setAppliedReceiptSearch] = useState('');
  const [salesPage, setSalesPage] = useState(1);

  const [dailyReport, setDailyReport] = useState<DailyReport | null>(null);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [sessions, setSessions] = useState<ReportSession[]>([]);
  const [branchComparisonRows, setBranchComparisonRows] = useState<BranchComparisonRow[]>([]);
  const [profitabilityReport, setProfitabilityReport] = useState<ProfitabilityReport | null>(null);
  const [expiringProducts, setExpiringProducts] = useState<ExpiringProduct[]>([]);
  const [ledgerSummary, setLedgerSummary] = useState<LedgerSummary | null>(null);

  const [companyCreateForm, setCompanyCreateForm] = useState<CompanyCreateForm>({
    address: '',
    email: '',
    maxCartDiscountPercent: '25',
    maxItemDiscountPercent: '40',
    name: '',
    phone: '',
    taxNumber: '',
  });
  const [companyEditForm, setCompanyEditForm] = useState<CompanyEditForm>({
    address: '',
    email: '',
    isActive: true,
    maxCartDiscountPercent: '25',
    maxItemDiscountPercent: '40',
    name: '',
    phone: '',
    taxNumber: '',
  });
  const [branchCreateForm, setBranchCreateForm] = useState<BranchCreateForm>({ address: '', name: '', phone: '' });
  const [branchEditForm, setBranchEditForm] = useState<BranchEditForm>({ address: '', isActive: true, name: '', phone: '' });
  const [invoiceTemplateForm, setInvoiceTemplateForm] = useState<InvoiceTemplateForm>({
    footerNote: '',
    headerText: '',
    logoUrl: '',
    taxOffice: '',
    tradeRegistryNo: '',
    salesFooterNote: '',
    salesHeaderText: '',
    salesLabel: '',
    purchaseFooterNote: '',
    purchaseHeaderText: '',
    purchaseLabel: '',
    dispatchFooterNote: '',
    dispatchHeaderText: '',
    dispatchLabel: '',
  });
  const [categoryForm, setCategoryForm] = useState<CategoryForm>({
    color: '#0f766e',
    name: '',
    parentId: '',
    sortOrder: '0',
  });
  const [categoryEditForm, setCategoryEditForm] = useState<CategoryForm>({
    color: '#0f766e',
    name: '',
    parentId: '',
    sortOrder: '0',
  });
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [productForm, setProductForm] = useState<ProductForm>({
    barcode: '',
    brand: '',
    categoryId: '',
    expiryDate: '',
    minStock: '0',
    name: '',
    purchasePrice: '0',
    salePrice: '0',
    supplierId: '',
    vatRate: '10',
  });
  const [productEditForm, setProductEditForm] = useState<ProductForm>({
    barcode: '',
    brand: '',
    categoryId: '',
    expiryDate: '',
    minStock: '0',
    name: '',
    purchasePrice: '0',
    salePrice: '0',
    supplierId: '',
    vatRate: '10',
  });
  const [selectedProductId, setSelectedProductId] = useState('');
  const [bulkProductForm, setBulkProductForm] = useState<BulkProductUpdateForm>({
    categoryId: '',
    isActive: 'true',
    minStock: '0',
    mode: 'SET_PRICE',
    percentage: '0',
    salePrice: '0',
  });
  const [movementForm, setMovementForm] = useState<StockMovementForm>({
    note: '',
    productId: '',
    quantity: '0',
    reference: '',
    type: '',
  });
  const [productFilters, setProductFilters] = useState<ProductListFilters>({
    active: '',
    brand: '',
    categoryId: '',
    maxPrice: '',
    maxPurchasePrice: '',
    minPrice: '',
    minPurchasePrice: '',
    search: '',
    supplierId: '',
    updatedFrom: '',
    updatedTo: '',
    vatRate: '',
  });
  const [stockMovementFilters, setStockMovementFilters] = useState<StockMovementListFilters>({
    dateFrom: '',
    dateTo: '',
    maxQuantity: '',
    minQuantity: '',
    search: '',
    type: '',
    userSearch: '',
  });
  const [userCreateForm, setUserCreateForm] = useState<UserCreateForm>({
    branchId: '',
    email: '',
    fullName: '',
    password: '',
    pin: '',
    role: 'CASHIER',
    username: '',
  });
  const [userEditForm, setUserEditForm] = useState<UserEditForm>({
    branchId: '',
    email: '',
    fullName: '',
    isActive: true,
    password: '',
    pin: '',
    role: 'CASHIER',
    username: '',
  });
  const [subscriptionPlanForm, setSubscriptionPlanForm] = useState<SubscriptionPlanForm>({
    note: '',
    packageExpiresAt: '',
    packageGraceDays: '7',
    packageStartedAt: '',
    packageStatus: 'ACTIVE',
  });
  const [subscriptionActionNote, setSubscriptionActionNote] = useState('');
  const [subscriptionProvisionForm, setSubscriptionProvisionForm] = useState<SubscriptionProvisionForm>({
    address: '',
    adminEmail: '',
    adminFullName: 'Sistem Yoneticisi',
    adminPassword: '',
    adminUsername: 'admin',
    branchName: 'Merkez Sube',
    companyId: '',
    companyName: '',
    email: '',
    graceDays: '7',
    overwriteStock: false,
    packageDays: '365',
    phone: '',
    registerName: 'K01',
    taxNumber: '',
    templateCode: '',
  });

  const { activeTab, allowedTabs, moveToTab } = useTabNavigation(auth.role ?? undefined, auth.isAuthenticated);

  const companiesQuery = useCompaniesQuery(auth.isAuthenticated && auth.isBackofficeWriter);
  const companies = useMemo(
    () =>
      auth.isBackofficeWriter
        ? [...(companiesQuery.data ?? [])].sort((left, right) => left.name.localeCompare(right.name, 'tr'))
        : [],
    [auth.isBackofficeWriter, companiesQuery.data],
  );
  const branchesQuery = useBranchesQuery(companyId, auth.isAuthenticated);
  const invoiceTemplateQuery = useInvoiceTemplateQuery(companyId, auth.isAuthenticated);
  const branches = useMemo(
    () => [...(branchesQuery.data ?? [])].sort((left, right) => left.name.localeCompare(right.name, 'tr')),
    [branchesQuery.data],
  );
  const categoriesQuery = useCategoriesQuery(companyId, auth.isAuthenticated && hasPermission(auth.role ?? undefined, 'access:catalog'));
  const categories = useMemo(
    () =>
      [...(categoriesQuery.data ?? [])].sort((left, right) => {
        if (left.sortOrder !== right.sortOrder) {
          return left.sortOrder - right.sortOrder;
        }
        return left.name.localeCompare(right.name, 'tr');
      }),
    [categoriesQuery.data],
  );
  const productsQuery = useProductsQuery(
    companyId,
    productFilters,
    auth.isAuthenticated && hasPermission(auth.role ?? undefined, 'access:catalog'),
  );
  const suppliersQuery = useSuppliersQuery(companyId, 1);
  const products = useMemo(
    () => [...(productsQuery.data ?? [])].sort((left, right) => left.name.localeCompare(right.name, 'tr')),
    [productsQuery.data],
  );
  const suppliers = useMemo(
    () =>
      [...(suppliersQuery.data?.data ?? [])].sort((left, right) =>
        left.name.localeCompare(right.name, 'tr'),
      ),
    [suppliersQuery.data?.data],
  );
  const usersQuery = useUsersQuery(companyId, auth.isAuthenticated && hasPermission(auth.role ?? undefined, 'access:users'));
  const users = useMemo(
    () => [...(usersQuery.data ?? [])].sort((left, right) => left.fullName.localeCompare(right.fullName, 'tr')),
    [usersQuery.data],
  );
  const stockLevelsQuery = useStockLevelsQuery(branchId, auth.isAuthenticated);
  const stockLevels = useMemo(
    () => [...(stockLevelsQuery.data ?? [])].sort((left, right) => left.product.name.localeCompare(right.product.name, 'tr')),
    [stockLevelsQuery.data],
  );
  const stockMovementsQuery = useStockMovementsQuery(
    branchId,
    stockMovementFilters,
    auth.isAuthenticated,
  );
  const stockMovements = useMemo(
    () =>
      [...(stockMovementsQuery.data ?? [])].sort(
        (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
      ),
    [stockMovementsQuery.data],
  );
  const registersQuery = useRegistersQuery(branchId, auth.isAuthenticated);
  const registers = useMemo(
    () => [...(registersQuery.data ?? [])].sort((left, right) => left.name.localeCompare(right.name, 'tr')),
    [registersQuery.data],
  );
  const operationsHealthQuery = useOperationsHealthQuery({
    branchId,
    companyId,
    enabled: auth.isAuthenticated && (!auth.isSuperAdmin || companyId.length > 0),
    isSuperAdmin: auth.isSuperAdmin,
    role: auth.role ?? '',
  });
  const subscriptionCompaniesQuery = useSubscriptionCompaniesQuery(appliedSubscriptionFilters, auth.isAuthenticated && auth.isSuperAdmin);
  const subscriptionRows = subscriptionCompaniesQuery.data?.rows ?? [];
  const subscriptionSummary = subscriptionCompaniesQuery.data?.summary ?? {
    ACTIVE: 0,
    EXPIRED: 0,
    GRACE: 0,
    SUSPENDED: 0,
    UNCONFIGURED: 0,
  };
  const subscriptionAuditQuery = useSubscriptionAuditQuery(subscriptionSelectedCompanyId, auth.isAuthenticated && auth.isSuperAdmin);
  const subscriptionAuditRows = subscriptionAuditQuery.data?.rows ?? [];
  const subscriptionAuditPagination = subscriptionAuditQuery.data?.pagination ?? { page: 1, total: 0, totalPages: 1 };
  const subscriptionTemplatesQuery = useProvisionTemplatesQuery(auth.isAuthenticated && auth.isSuperAdmin);
  const subscriptionTemplates = subscriptionTemplatesQuery.data ?? [];
  const reportsMutation = useReportsMutation();

  const stockTransfersQuery = useStockTransfersQuery({ companyId, status: transferStatusFilter || undefined });
  const transferDetailQuery = useStockTransferDetailQuery(selectedTransferId);
  const stockTransferMutations = useStockTransferMutations();

  const customersQuery = useCustomersQuery(companyId, 1, customerSearch);
  const customerTransactionsQuery = useCustomerTransactionsQuery(selectedCustomerId);
  const customerMutations = useCustomerMutations();

  const salesQuery = useSalesQuery({ companyId, branchId, from: salesFrom, to: salesTo, page: salesPage });
  const saleDetailQuery = useSaleDetailQuery(selectedSaleId);
  const refundsQuery = useRefundsQuery(selectedSaleId);

  const stockTransfersData = stockTransfersQuery.data as PaginatedResponse<StockTransfer> | undefined;
  const salesData = salesQuery.data as PaginatedResponse<Sale> | undefined;

  const companiesErrorText = companiesQuery.isError ? readError(companiesQuery.error, 'Firma listesi yuklenemedi') : null;
  const branchesErrorText = branchesQuery.isError ? readError(branchesQuery.error, 'Sube listesi yuklenemedi') : null;
  const categoriesErrorText = categoriesQuery.isError ? readError(categoriesQuery.error, 'Kategori listesi yuklenemedi') : null;
  const productsErrorText = productsQuery.isError ? readError(productsQuery.error, 'Urun listesi yuklenemedi') : null;
  const usersErrorText = usersQuery.isError ? readError(usersQuery.error, 'Kullanici listesi yuklenemedi') : null;
  const stockLevelsErrorText = stockLevelsQuery.isError ? readError(stockLevelsQuery.error, 'Stok seviyeleri yuklenemedi') : null;
  const stockMovementsErrorText = stockMovementsQuery.isError
    ? readError(stockMovementsQuery.error, 'Stok hareketleri yuklenemedi')
    : null;
  const operationsHealthErrorText = operationsHealthQuery.isError
    ? readError(operationsHealthQuery.error, 'Operasyon saglik verisi yuklenemedi')
    : null;
  const reportsErrorText = reportsMutation.isError ? readError(reportsMutation.error, 'Rapor verisi yuklenemedi') : null;
  const subscriptionErrorText = subscriptionCompaniesQuery.isError
    ? readError(subscriptionCompaniesQuery.error, 'Paket listesi yuklenemedi')
    : null;
  const subscriptionAuditErrorText = subscriptionAuditQuery.isError
    ? readError(subscriptionAuditQuery.error, 'Audit kayitlari yuklenemedi')
    : null;
  const subscriptionTemplateErrorText = subscriptionTemplatesQuery.isError
    ? readError(subscriptionTemplatesQuery.error, 'Template listesi yuklenemedi')
    : null;
  const systemAuditQuery = useSystemAuditQuery(auth.isAuthenticated && auth.isSuperAdmin);
  const systemAuditRows = systemAuditQuery.data?.rows ?? [];
  const systemAuditErrorText = systemAuditQuery.isError
    ? readError(systemAuditQuery.error, 'Denetim kayitlari yuklenemedi')
    : null;

  const selectedCompany = useMemo(() => companies.find((company) => company.id === companyId) ?? null, [companies, companyId]);
  const selectedBranch = useMemo(() => branches.find((branch) => branch.id === branchId) ?? null, [branches, branchId]);
  const selectedCategory = useMemo(
    () => categories.find((category) => category.id === selectedCategoryId) ?? null,
    [categories, selectedCategoryId],
  );
  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedProductId) ?? null,
    [products, selectedProductId],
  );
  const selectedUser = useMemo(() => users.find((user) => user.id === selectedUserId) ?? null, [users, selectedUserId]);
  const userCreateRoleOptions = useMemo(
    () => resolveAssignableRoles(auth.role),
    [auth.role],
  );
  const userEditRoleOptions = useMemo(() => {
    if (!selectedUser) {
      return userCreateRoleOptions;
    }
    if (userCreateRoleOptions.includes(selectedUser.role)) {
      return userCreateRoleOptions;
    }
    return [selectedUser.role, ...userCreateRoleOptions];
  }, [selectedUser, userCreateRoleOptions]);
  const canCreateUsersInHierarchy = userCreateRoleOptions.length > 0;
  const canEditSelectedUser = useMemo(() => {
    if (!selectedUser) {
      return false;
    }
    if (selectedUser.id === auth.session?.user.id) {
      return true;
    }
    return canManageRole(auth.role, selectedUser.role);
  }, [auth.role, auth.session?.user.id, selectedUser]);
  const isSelectedUserSelf = selectedUser?.id === auth.session?.user.id;
  const selectedUserRestrictionMessage = useMemo(() => {
    if (!selectedUser) {
      return null;
    }
    if (selectedUser.id === auth.session?.user.id) {
      return 'Kendi hesabinizi duzenleyebilirsiniz; rol degisikligi/pasife alma/silme API tarafinda korunur.';
    }
    if (canManageRole(auth.role, selectedUser.role)) {
      return null;
    }
    return 'Secili kullanici rolu firma ici hiyerarside sizin seviyenizde veya uzerinde oldugu icin bu hesabi guncelleyemezsiniz.';
  }, [auth.role, auth.session?.user.id, selectedUser]);
  const selectedSubscriptionRow = useMemo(
    () => subscriptionRows.find((row) => row.company.id === subscriptionSelectedCompanyId) ?? null,
    [subscriptionRows, subscriptionSelectedCompanyId],
  );

  const sortedSubscriptionRows = useMemo(() => {
    const rows = [...subscriptionRows];
    rows.sort((left, right) => {
      if (subscriptionSort === 'NAME_ASC') {
        return left.company.name.localeCompare(right.company.name, 'tr');
      }
      if (subscriptionSort === 'STATUS') {
        const statusCompare = left.access.status.localeCompare(right.access.status, 'tr');
        if (statusCompare !== 0) {
          return statusCompare;
        }
        return left.company.name.localeCompare(right.company.name, 'tr');
      }
      const leftDays = left.access.daysRemaining ?? Number.POSITIVE_INFINITY;
      const rightDays = right.access.daysRemaining ?? Number.POSITIVE_INFINITY;
      const delta = subscriptionSort === 'DUE_DESC' ? rightDays - leftDays : leftDays - rightDays;
      if (delta !== 0) {
        return delta;
      }
      return left.company.name.localeCompare(right.company.name, 'tr');
    });
    return rows;
  }, [subscriptionRows, subscriptionSort]);

  const subscriptionDueLimit = Math.max(0, intNum(appliedSubscriptionFilters.dueInDays, 30));
  const upcomingRenewals = useMemo(
    () =>
      sortedSubscriptionRows
        .filter((row) => row.access.status === 'ACTIVE' || row.access.status === 'GRACE')
        .filter((row) => typeof row.access.daysRemaining === 'number' && row.access.daysRemaining <= subscriptionDueLimit)
        .slice(0, 15),
    [sortedSubscriptionRows, subscriptionDueLimit],
  );

  const reportKpis = useMemo(() => {
    const sessionGrossSales = sessions.reduce(
      (sum, current) => sum + (current.totalCashSales ?? 0) + (current.totalCardSales ?? 0),
      0,
    );
    const sessionRefundTotal = sessions.reduce((sum, current) => sum + (current.totalRefunds ?? 0), 0);
    const criticalStockCount = stockLevels.filter((stockLevel) => stockLevel.quantity <= stockLevel.product.minStock).length;
    const averageTicket = dailyReport && dailyReport.salesCount > 0 ? dailyReport.totalSales / dailyReport.salesCount : 0;

    return {
      averageTicket,
      criticalStockCount,
      sessionGrossSales,
      sessionNetSales: sessionGrossSales - sessionRefundTotal,
      sessionRefundTotal,
    };
  }, [dailyReport, sessions, stockLevels]);

  useEffect(() => {
    if (selectedCategoryId.length > 0 && !categories.some((category) => category.id === selectedCategoryId)) {
      setSelectedCategoryId('');
    }
  }, [categories, selectedCategoryId]);

  useEffect(() => {
    if (!selectedCategory) {
      return;
    }
    setCategoryEditForm({
      color: selectedCategory.color ?? '',
      name: selectedCategory.name,
      parentId: selectedCategory.parentId ?? '',
      sortOrder: String(selectedCategory.sortOrder),
    });
  }, [selectedCategory]);

  useEffect(() => {
    if (selectedProductId.length > 0 && !products.some((product) => product.id === selectedProductId)) {
      setSelectedProductId('');
    }
  }, [products, selectedProductId]);

  useEffect(() => {
    if (!selectedProduct) {
      return;
    }
    setProductEditForm({
      barcode: selectedProduct.barcode,
      brand: selectedProduct.brand ?? '',
      categoryId: selectedProduct.categoryId ?? '',
      expiryDate: selectedProduct.expiryDate ?? '',
      minStock: String(selectedProduct.minStock),
      name: selectedProduct.name,
      purchasePrice: String(selectedProduct.purchasePrice),
      salePrice: String(selectedProduct.salePrice),
      supplierId: selectedProduct.supplierId ?? '',
      vatRate: String(selectedProduct.vatRate),
    });
  }, [selectedProduct]);

  const companyMutations = useCompanyMutations(selectedCompany?.id ?? '');
  const branchMutations = useBranchMutations(companyId, selectedBranch?.id ?? '');
  const invoiceTemplateMutation = useInvoiceTemplateMutation(companyId);
  const catalogMutations = useCatalogMutations(companyId);
  const stockMutations = useStockMutations(branchId);
  const userMutations = useUserMutations(companyId, selectedUser?.id ?? '');
  const subscriptionMutations = useSubscriptionMutations(appliedSubscriptionFilters, subscriptionSelectedCompanyId);

  const saving =
    isRefreshing ||
    companyMutations.createCompany.isPending ||
    companyMutations.updateCompany.isPending ||
    companyMutations.deleteCompany.isPending ||
    branchMutations.createBranch.isPending ||
    branchMutations.updateBranch.isPending ||
    branchMutations.deleteBranch.isPending ||
    invoiceTemplateMutation.isPending ||
    catalogMutations.createCategory.isPending ||
    catalogMutations.createProduct.isPending ||
    catalogMutations.updateCategory.isPending ||
    catalogMutations.deleteCategory.isPending ||
    catalogMutations.updateProduct.isPending ||
    catalogMutations.deleteProduct.isPending ||
    catalogMutations.bulkProductUpdate.isPending ||
    stockMutations.createStockMovement.isPending ||
    userMutations.createUser.isPending ||
    userMutations.updateUser.isPending ||
    userMutations.deleteUser.isPending ||
    subscriptionMutations.provisionCompany.isPending ||
    subscriptionMutations.quickRenew.isPending ||
    subscriptionMutations.suspend.isPending ||
    subscriptionMutations.unsuspend.isPending ||
    subscriptionMutations.savePlan.isPending;

  useEffect(() => {
    if (!auth.isAuthenticated) {
      return;
    }
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        setOrDelete(next, 'reportDate', dailyDate, today);
        setOrDelete(next, 'reportFrom', reportRange.from);
        setOrDelete(next, 'reportTo', reportRange.to);
        setOrDelete(next, 'reportRegister', reportRegisterId);
        setOrDelete(next, 'subSearch', subscriptionFilters.search);
        setOrDelete(next, 'subStatus', subscriptionFilters.status);
        setOrDelete(next, 'subDue', subscriptionFilters.dueInDays, '30');
        setOrDelete(next, 'subSort', subscriptionSort, 'DUE_ASC');
        if (next.toString() === current.toString()) {
          return current;
        }
        return next;
      },
      { replace: true },
    );
  }, [
    dailyDate,
    reportRange.from,
    reportRange.to,
    reportRegisterId,
    setSearchParams,
    subscriptionFilters.dueInDays,
    subscriptionFilters.search,
    subscriptionFilters.status,
    subscriptionSort,
    today,
  ]);

  useEffect(() => {
    if (!auth.isAuthenticated) {
      setCompanyId('');
      setBranchId('');
      setSelectedUserId('');
      setSubscriptionSelectedCompanyId('');
      setDailyReport(null);
      setTopProducts([]);
      setSessions([]);
      setBranchComparisonRows([]);
      return;
    }

    if (auth.isSuperAdmin) {
      setCompanyId((current) =>
        current.length > 0 && companies.some((row) => row.id === current)
          ? current
          : '',
      );
      return;
    }

    if (!auth.isBackofficeWriter) {
      setCompanyId(auth.session?.user.companyId ?? '');
      return;
    }

    setCompanyId(auth.session?.user.companyId ?? '');
  }, [
    auth.isAuthenticated,
    auth.isBackofficeWriter,
    auth.isSuperAdmin,
    auth.session?.user.companyId,
    companies,
  ]);

  useEffect(() => {
    setBranchId((current) =>
      current.length > 0 && branches.some((row) => row.id === current) ? current : branches[0]?.id ?? '',
    );
  }, [branches]);

  useEffect(() => {
    setSelectedUserId((current) =>
      current.length > 0 && users.some((row) => row.id === current) ? current : users[0]?.id ?? '',
    );
  }, [users]);

  useEffect(() => {
    setReportRegisterId((current) =>
      current.length > 0 && registers.some((row) => row.id === current) ? current : registers[0]?.id ?? '',
    );
  }, [registers]);

  useEffect(() => {
    setSubscriptionSelectedCompanyId((current) =>
      current.length > 0 && subscriptionRows.some((row) => row.company.id === current)
        ? current
        : subscriptionRows[0]?.company.id ?? '',
    );
  }, [subscriptionRows]);

  useEffect(() => {
    if (subscriptionTemplates.length === 0) {
      return;
    }
    setSubscriptionProvisionForm((current) => {
      const hasCurrentTemplate =
        current.templateCode.length > 0 &&
        subscriptionTemplates.some((template) => template.code === current.templateCode);
      if (hasCurrentTemplate) {
        return current;
      }
      return {
        ...current,
        templateCode: subscriptionTemplates[0]?.code ?? '',
      };
    });
  }, [subscriptionTemplates]);

  useEffect(() => {
    if (!selectedCompany) {
      setCompanyEditForm({
        address: '',
        email: '',
        isActive: true,
        maxCartDiscountPercent: '25',
        maxItemDiscountPercent: '40',
        name: '',
        phone: '',
        taxNumber: '',
      });
      return;
    }
    setCompanyEditForm({
      address: selectedCompany.address ?? '',
      email: selectedCompany.email ?? '',
      isActive: selectedCompany.isActive,
      maxCartDiscountPercent: String(selectedCompany.maxCartDiscountPercent ?? 25),
      maxItemDiscountPercent: String(selectedCompany.maxItemDiscountPercent ?? 40),
      name: selectedCompany.name,
      phone: selectedCompany.phone ?? '',
      taxNumber: selectedCompany.taxNumber ?? '',
    });
  }, [selectedCompany]);

  useEffect(() => {
    if (!selectedBranch) {
      setBranchEditForm({ address: '', isActive: true, name: '', phone: '' });
      return;
    }
    setBranchEditForm({
      address: selectedBranch.address ?? '',
      isActive: selectedBranch.isActive,
      name: selectedBranch.name,
      phone: selectedBranch.phone ?? '',
    });
  }, [selectedBranch]);

  useEffect(() => {
    const tpl = invoiceTemplateQuery.data;
    if (!tpl) {
      return;
    }
    setInvoiceTemplateForm({
      footerNote: tpl.footerNote ?? '',
      headerText: tpl.headerText ?? '',
      logoUrl: tpl.logoUrl ?? '',
      taxOffice: tpl.taxOffice ?? '',
      tradeRegistryNo: tpl.tradeRegistryNo ?? '',
      salesFooterNote: tpl.sales?.footerNote ?? '',
      salesHeaderText: tpl.sales?.headerText ?? '',
      salesLabel: tpl.sales?.label ?? '',
      purchaseFooterNote: tpl.purchase?.footerNote ?? '',
      purchaseHeaderText: tpl.purchase?.headerText ?? '',
      purchaseLabel: tpl.purchase?.label ?? '',
      dispatchFooterNote: tpl.dispatch?.footerNote ?? '',
      dispatchHeaderText: tpl.dispatch?.headerText ?? '',
      dispatchLabel: tpl.dispatch?.label ?? '',
    });
  }, [invoiceTemplateQuery.data]);

  useEffect(() => {
    if (!selectedUser) {
      setUserEditForm({
        branchId: '',
        email: '',
        fullName: '',
        isActive: true,
        password: '',
        pin: '',
        role: 'CASHIER',
        username: '',
      });
      return;
    }
    setUserEditForm({
      branchId: selectedUser.branchId ?? '',
      email: selectedUser.email ?? '',
      fullName: selectedUser.fullName,
      isActive: selectedUser.isActive,
      password: '',
      pin: '',
      role: selectedUser.role,
      username: selectedUser.username,
    });
  }, [selectedUser]);

  useEffect(() => {
    if (userCreateRoleOptions.length === 0) {
      return;
    }
    setUserCreateForm((current) => {
      if (userCreateRoleOptions.includes(current.role)) {
        return current;
      }
      return {
        ...current,
        role: userCreateRoleOptions[0],
      };
    });
  }, [userCreateRoleOptions]);

  useEffect(() => {
    if (!selectedSubscriptionRow) {
      setSubscriptionPlanForm({
        note: '',
        packageExpiresAt: '',
        packageGraceDays: '7',
        packageStartedAt: '',
        packageStatus: 'ACTIVE',
      });
      return;
    }
    setSubscriptionPlanForm((current) => ({
      ...current,
      packageExpiresAt: toDateInput(selectedSubscriptionRow.company.packageExpiresAt),
      packageGraceDays: String(selectedSubscriptionRow.company.packageGraceDays),
      packageStartedAt: toDateInput(selectedSubscriptionRow.company.packageStartedAt),
      packageStatus: selectedSubscriptionRow.company.packageStatus,
    }));
  }, [selectedSubscriptionRow]);

  const selectedCompanyName = selectedCompany?.name ?? '-';
  const selectedBranchName = selectedBranch?.name ?? '-';
  const requiresCompanySelection =
    auth.isSuperAdmin &&
    companyId.trim().length === 0 &&
    activeTab !== 'subscription' &&
    activeTab !== 'setup';

  const exportSubscriptionRows = (rows: typeof subscriptionRows, filename: string): void => {
    downloadCsv(
      filename,
      ['Firma', 'Vergi No', 'Runtime Durum', 'Kalan Gun', 'Paket Durumu', 'Paket Bitis', 'Grace Sonu', 'Son Audit'],
      rows.map((row) => [
        row.company.name,
        row.company.taxNumber ?? '',
        row.access.status,
        row.access.daysRemaining ?? '',
        row.company.packageStatus,
        toDateTime(row.company.packageExpiresAt),
        toDateTime(row.company.packageGraceEndsAt),
        toDateTime(row.lastAuditAt),
      ]),
    );
  };

  const applyRangePreset = (preset: 'day' | 'week' | 'month'): void => {
    const now = new Date();
    if (preset === 'day') {
      const day = toLocalDateIso(now);
      setReportRange({ from: day, to: day });
      return;
    }
    if (preset === 'week') {
      const start = new Date(now);
      start.setDate(now.getDate() - 6);
      setReportRange({ from: toLocalDateIso(start), to: toLocalDateIso(now) });
      return;
    }
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    setReportRange({ from: toLocalDateIso(monthStart), to: toLocalDateIso(now) });
  };



  const createCompany = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    try {
      const created = await companyMutations.createCompany.mutateAsync(companyCreateForm);
      setCompanyId(created.id);
      setCompanyCreateForm({
        address: '',
        email: '',
        maxCartDiscountPercent: '25',
        maxItemDiscountPercent: '40',
        name: '',
        phone: '',
        taxNumber: '',
      });
      setBanner({ type: 'success', text: 'Firma eklendi' });
    } catch (error: unknown) {
      setBanner({ type: 'error', text: readError(error, 'Firma eklenemedi') });
    }
  };

  const updateCompany = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!selectedCompany) {
      return;
    }
    try {
      await companyMutations.updateCompany.mutateAsync(companyEditForm);
      setBanner({ type: 'success', text: 'Firma guncellendi' });
    } catch (error: unknown) {
      setBanner({ type: 'error', text: readError(error, 'Firma guncellenemedi') });
    }
  };

  const deleteCompany = async (): Promise<void> => {
    if (!selectedCompany) {
      return;
    }
    if (!window.confirm(`"${selectedCompany.name}" firmasini silmek istiyor musunuz?`)) {
      return;
    }
    try {
      await companyMutations.deleteCompany.mutateAsync();
      setCompanyId('');
      setBanner({ type: 'success', text: 'Firma silindi' });
    } catch (error: unknown) {
      setBanner({ type: 'error', text: readError(error, 'Firma silinemedi') });
    }
  };

  const createBranch = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (companyId.length === 0) {
      return;
    }
    try {
      const created = await branchMutations.createBranch.mutateAsync({ ...branchCreateForm, companyId });
      setBranchId(created.id);
      setBranchCreateForm({ address: '', name: '', phone: '' });
      setBanner({ type: 'success', text: 'Sube eklendi' });
    } catch (error: unknown) {
      setBanner({ type: 'error', text: readError(error, 'Sube eklenemedi') });
    }
  };

  const updateBranch = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!selectedBranch) {
      return;
    }
    try {
      await branchMutations.updateBranch.mutateAsync(branchEditForm);
      setBanner({ type: 'success', text: 'Sube guncellendi' });
    } catch (error: unknown) {
      setBanner({ type: 'error', text: readError(error, 'Sube guncellenemedi') });
    }
  };

  const deleteBranch = async (): Promise<void> => {
    if (!selectedBranch) {
      return;
    }
    if (!window.confirm(`"${selectedBranch.name}" subesini silmek istiyor musunuz?`)) {
      return;
    }
    try {
      await branchMutations.deleteBranch.mutateAsync();
      setBanner({ type: 'success', text: 'Sube silindi' });
    } catch (error: unknown) {
      setBanner({ type: 'error', text: readError(error, 'Sube silinemedi') });
    }
  };

  const saveInvoiceTemplate = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (companyId.length === 0) {
      setBanner({ type: 'error', text: 'Sablon kaydi icin once firma secin' });
      return;
    }
    try {
      await invoiceTemplateMutation.mutateAsync(invoiceTemplateForm);
      setBanner({ type: 'success', text: 'Fatura sablonu guncellendi' });
    } catch (error: unknown) {
      setBanner({ type: 'error', text: readError(error, 'Fatura sablonu kaydedilemedi') });
    }
  };

  const addCategory = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (companyId.length === 0) {
      return;
    }
    const timer = createFlowTimer('catalog.category.create');
    try {
      await catalogMutations.createCategory.mutateAsync({ ...categoryForm, companyId });
      setCategoryForm({ color: '#0f766e', name: '', parentId: '', sortOrder: '0' });
      setBanner({ type: 'success', text: 'Kategori eklendi' });
      timer.success();
    } catch (error: unknown) {
      setBanner({ type: 'error', text: readError(error, 'Kategori eklenemedi') });
      timer.fail();
    }
  };

  const updateCategory = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!selectedCategory) {
      return;
    }
    const timer = createFlowTimer('catalog.category.update');
    try {
      await catalogMutations.updateCategory.mutateAsync({
        ...categoryEditForm,
        id: selectedCategory.id,
      });
      setBanner({ type: 'success', text: 'Kategori guncellendi' });
      timer.success();
    } catch (error: unknown) {
      setBanner({ type: 'error', text: readError(error, 'Kategori guncellenemedi') });
      timer.fail();
    }
  };

  const deleteCategory = async (): Promise<void> => {
    if (!selectedCategory) {
      return;
    }
    const transferCategoryId = window.prompt(
      'Kategori urunleri varsa tasinacak kategori ID girin (bos birakirsaniz bagli urunde silme iptal olur):',
      '',
    ) ?? '';
    if (!window.confirm(`"${selectedCategory.name}" kategorisini silmek istiyor musunuz?`)) {
      return;
    }
    const timer = createFlowTimer('catalog.category.delete');
    try {
      await catalogMutations.deleteCategory.mutateAsync({
        id: selectedCategory.id,
        transferCategoryId,
      });
      setSelectedCategoryId('');
      setBanner({ type: 'success', text: 'Kategori silindi' });
      timer.success();
    } catch (error: unknown) {
      setBanner({ type: 'error', text: readError(error, 'Kategori silinemedi') });
      timer.fail();
    }
  };

  const setupDefaultCatalog = async (): Promise<void> => {
    if (companyId.length === 0) {
      return;
    }
    if (!window.confirm('4000+ urun iceren varsayilan urun katalogunu yuklemek istiyor musunuz? Bu islem birkac dakika surebilir.')) {
      return;
    }
    const timer = createFlowTimer('catalog.defaults.setup');
    try {
      setBanner({ type: 'success', text: 'Varsayilan katalog yukleme islemi baslatildi, arka planda yukleniyor...' });
      const result = await catalogMutations.setupDefaults.mutateAsync({ companyId });
      setBanner({ type: 'success', text: `Varsayilan katalog basariyla yuklendi! ${result.totalSynced} urun esitlendi.` });
      timer.success();
    } catch (error: unknown) {
      setBanner({ type: 'error', text: readError(error, 'Varsayilan katalog yuklenemedi') });
      timer.fail();
    }
  };

  const addProduct = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (companyId.length === 0) {
      return;
    }
    const timer = createFlowTimer('catalog.product.create');
    try {
      await catalogMutations.createProduct.mutateAsync({ ...productForm, companyId });
      setProductForm((current) => ({
        ...current,
        barcode: '',
        brand: '',
        minStock: '0',
        name: '',
        purchasePrice: '0',
        salePrice: '0',
        supplierId: '',
      }));
      setBanner({ type: 'success', text: 'Urun eklendi' });
      timer.success();
    } catch (error: unknown) {
      setBanner({ type: 'error', text: readError(error, 'Urun eklenemedi') });
      timer.fail();
    }
  };

  const updateProduct = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!selectedProduct) {
      return;
    }
    const timer = createFlowTimer('catalog.product.update.single');
    try {
      await catalogMutations.updateProduct.mutateAsync({
        ...productEditForm,
        id: selectedProduct.id,
        isActive: selectedProduct.isActive,
      });
      setBanner({ type: 'success', text: 'Urun guncellendi' });
      timer.success();
    } catch (error: unknown) {
      setBanner({ type: 'error', text: readError(error, 'Urun guncellenemedi') });
      timer.fail();
    }
  };

  const toggleProductActive = async (productId: string, isActive: boolean): Promise<void> => {
    const product = products.find((row) => row.id === productId);
    if (!product) {
      return;
    }
    const timer = createFlowTimer('catalog.product.toggle_active');
    try {
      await catalogMutations.updateProduct.mutateAsync({
        barcode: product.barcode,
        brand: product.brand ?? '',
        categoryId: product.categoryId ?? '',
        expiryDate: product.expiryDate ?? '',
        id: product.id,
        isActive,
        minStock: String(product.minStock),
        name: product.name,
        purchasePrice: String(product.purchasePrice),
        salePrice: String(product.salePrice),
        supplierId: product.supplierId ?? '',
        vatRate: String(product.vatRate),
      });
      setBanner({ type: 'success', text: `Urun ${isActive ? 'aktif' : 'pasif'} yapildi` });
      timer.success();
    } catch (error: unknown) {
      setBanner({ type: 'error', text: readError(error, 'Urun durumu guncellenemedi') });
      timer.fail();
    }
  };

  const deleteProduct = async (productId: string): Promise<void> => {
    const product = products.find((row) => row.id === productId);
    if (!product) {
      return;
    }
    if (!window.confirm(`"${product.name}" urununu silmek istiyor musunuz?`)) {
      return;
    }
    const timer = createFlowTimer('catalog.product.delete');
    try {
      await catalogMutations.deleteProduct.mutateAsync({ id: product.id });
      if (selectedProductId === product.id) {
        setSelectedProductId('');
      }
      setBanner({ type: 'success', text: 'Urun silindi' });
      timer.success();
    } catch (error: unknown) {
      setBanner({ type: 'error', text: readError(error, 'Urun silinemedi') });
      timer.fail();
    }
  };

  const previewBulkProducts = async (
    selectedProductIds: string[],
    form: BulkProductUpdateForm,
  ) => {
    if (companyId.length === 0) {
      return null;
    }
    return catalogMutations.bulkProductUpdate.mutateAsync({
      companyId,
      form,
      previewOnly: true,
      productIds: selectedProductIds,
    });
  };

  const applyBulkProducts = async (
    selectedProductIds: string[],
    form: BulkProductUpdateForm,
  ): Promise<void> => {
    if (companyId.length === 0) {
      return;
    }
    const timer = createFlowTimer('catalog.product.bulk_update.100');
    try {
      const result = await catalogMutations.bulkProductUpdate.mutateAsync({
        companyId,
        form,
        previewOnly: false,
        productIds: selectedProductIds,
      });
      const summary = result.summary;
      setBanner({
        type: 'success',
        text:
          summary
            ? `Toplu guncelleme tamamlandi. Basarili: ${summary.updated}, Hatali: ${summary.failed}`
            : 'Toplu guncelleme tamamlandi',
      });
      timer.success();
    } catch (error: unknown) {
      setBanner({ type: 'error', text: readError(error, 'Toplu guncelleme basarisiz') });
      timer.fail();
    }
  };

  const addStockMovement = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (branchId.length === 0 || movementForm.productId.length === 0) {
      return;
    }
    const timer = createFlowTimer('stock.movement.create');
    try {
      await stockMutations.createStockMovement.mutateAsync({ ...movementForm, branchId });
      setMovementForm((current) => ({ ...current, note: '', quantity: '0', reference: '', type: '' }));
      setBanner({ type: 'success', text: 'Stok hareketi kaydedildi' });
      timer.success();
    } catch (error: unknown) {
      setBanner({ type: 'error', text: readError(error, 'Stok hareketi kaydedilemedi') });
      timer.fail();
    }
  };

  const applyStockMovementFilters = (
    updater: (current: StockMovementListFilters) => StockMovementListFilters,
  ): void => {
    const timer = createFlowTimer('stock.movement.filter');
    setStockMovementFilters((current) => updater(current));
    timer.success();
  };

  const createUser = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (companyId.length === 0) {
      return;
    }
    if (!canCreateUsersInHierarchy) {
      setBanner({
        type: 'error',
        text: 'Firma ici rol hiyerarsisi nedeniyle bu seviyede kullanici olusturamazsiniz',
      });
      return;
    }
    try {
      const created = await userMutations.createUser.mutateAsync({ ...userCreateForm, companyId });
      setSelectedUserId(created.id);
      setUserCreateForm({
        branchId: '',
        email: '',
        fullName: '',
        password: '',
        pin: '',
        role: userCreateRoleOptions[0] ?? 'CASHIER',
        username: '',
      });
      setBanner({ type: 'success', text: 'Kullanici eklendi' });
    } catch (error: unknown) {
      setBanner({ type: 'error', text: readError(error, 'Kullanici eklenemedi') });
    }
  };

  const updateUser = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!selectedUser) {
      return;
    }
    if (!canEditSelectedUser) {
      setBanner({
        type: 'error',
        text: selectedUserRestrictionMessage ?? 'Secili kullanici firma ici hiyerarsi nedeniyle guncellenemez',
      });
      return;
    }
    try {
      await userMutations.updateUser.mutateAsync(userEditForm);
      setBanner({ type: 'success', text: 'Kullanici guncellendi' });
    } catch (error: unknown) {
      setBanner({ type: 'error', text: readError(error, 'Kullanici guncellenemedi') });
    }
  };

  const deleteUser = async (): Promise<void> => {
    if (!selectedUser) {
      return;
    }
    if (!canEditSelectedUser) {
      setBanner({
        type: 'error',
        text: selectedUserRestrictionMessage ?? 'Secili kullanici firma ici hiyerarsi nedeniyle silinemez',
      });
      return;
    }
    if (!window.confirm(`"${selectedUser.fullName}" kullanicisini silmek istiyor musunuz?`)) {
      return;
    }
    try {
      await userMutations.deleteUser.mutateAsync();
      setBanner({ type: 'success', text: 'Kullanici silindi' });
    } catch (error: unknown) {
      setBanner({ type: 'error', text: readError(error, 'Kullanici silinemedi') });
    }
  };

  const loadReports = async (): Promise<void> => {
    if (branchId.length === 0) {
      setBanner({ type: 'error', text: 'Rapor icin once bir sube secin' });
      return;
    }
    try {
      const payload = await reportsMutation.mutateAsync({
        branchId,
        companyId: auth.isSuperAdmin ? companyId : undefined,
        dailyDate,
        from: reportRange.from,
        registerId: reportRegisterId,
        sessionLimit: 300,
        to: reportRange.to,
      });
      setDailyReport(payload.dailyReport);
      setTopProducts(payload.topProducts);
      setSessions(payload.sessions);
      setBranchComparisonRows(payload.branchComparisonRows);
      setProfitabilityReport(payload.profitabilityReport);
      setExpiringProducts(payload.expiringProducts);
      setLedgerSummary(payload.ledgerSummary);
      setBanner({ type: 'success', text: 'Raporlar guncellendi' });
    } catch (error: unknown) {
      setBanner({ type: 'error', text: readError(error, 'Raporlar yuklenemedi') });
    }
  };

  const refreshDashboard = async (): Promise<void> => {
    setIsRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: queryKeys.companies });
      if (companyId.length > 0) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.branches(companyId) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.categories(companyId) }),
          queryClient.invalidateQueries({ queryKey: ['products', companyId] }),
          queryClient.invalidateQueries({ queryKey: queryKeys.users(companyId) }),
        ]);
      }
      if (branchId.length > 0) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.stockLevels(branchId) }),
          queryClient.invalidateQueries({ queryKey: ['stock-movements', branchId] }),
          queryClient.invalidateQueries({ queryKey: queryKeys.registers(branchId) }),
          queryClient.invalidateQueries({
            queryKey: queryKeys.operationsHealth(auth.role ?? '', companyId, branchId),
          }),
        ]);
      }
      if (auth.isSuperAdmin) {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: queryKeys.subscriptionCompanies(appliedSubscriptionFilters),
          }),
          queryClient.invalidateQueries({
            queryKey: queryKeys.subscriptionAudit(subscriptionSelectedCompanyId),
          }),
          queryClient.invalidateQueries({
            queryKey: queryKeys.subscriptionTemplates,
          }),
        ]);
      }
      setBanner({ type: 'success', text: 'Veriler yenilendi' });
    } catch (error: unknown) {
      setBanner({ type: 'error', text: readError(error, 'Yenileme basarisiz') });
    } finally {
      setIsRefreshing(false);
    }
  };

  const reloadAudit = async (): Promise<void> => {
    if (subscriptionSelectedCompanyId.length === 0) {
      return;
    }
    try {
      await subscriptionAuditQuery.refetch();
      setBanner({ type: 'success', text: 'Audit kayitlari yenilendi' });
    } catch (error: unknown) {
      setBanner({ type: 'error', text: readError(error, 'Audit kayitlari yenilenemedi') });
    }
  };

  const renewSubscription = async (targetCompanyId: string): Promise<void> => {
    try {
      await subscriptionMutations.quickRenew.mutateAsync({
        companyId: targetCompanyId,
        note: subscriptionActionNote,
      });
      setBanner({ type: 'success', text: 'Paket hizli yenilendi' });
      setSubscriptionActionNote('');
    } catch (error: unknown) {
      setBanner({ type: 'error', text: readError(error, 'Paket yenileme basarisiz') });
    }
  };

  const suspendSubscription = async (targetCompanyId: string): Promise<void> => {
    if (subscriptionActionNote.trim().length < 3) {
      setBanner({ type: 'error', text: 'Askiya alma islemi icin aciklayici bir not yazin' });
      return;
    }
    if (!window.confirm('Firmayi askiya almak istiyor musunuz?')) {
      return;
    }
    try {
      await subscriptionMutations.suspend.mutateAsync({
        companyId: targetCompanyId,
        note: subscriptionActionNote.trim(),
      });
      setBanner({ type: 'success', text: 'Firma askiya alindi' });
      setSubscriptionActionNote('');
    } catch (error: unknown) {
      setBanner({ type: 'error', text: readError(error, 'Askiya alma islemi basarisiz') });
    }
  };

  const unsuspendSubscription = async (targetCompanyId: string): Promise<void> => {
    if (subscriptionActionNote.trim().length < 3) {
      setBanner({ type: 'error', text: 'Askidan cikarma islemi icin aciklayici bir not yazin' });
      return;
    }
    try {
      await subscriptionMutations.unsuspend.mutateAsync({
        companyId: targetCompanyId,
        note: subscriptionActionNote.trim(),
      });
      setBanner({ type: 'success', text: 'Firma askidan cikarildi' });
      setSubscriptionActionNote('');
    } catch (error: unknown) {
      setBanner({ type: 'error', text: readError(error, 'Askidan cikarma islemi basarisiz') });
    }
  };

  const generateLicenseKeyForCompany = async (targetCompanyId: string): Promise<void> => {
    if (!window.confirm('Yeni bir lisans anahtari uretmek istiyor musunuz? Mevcut aktif olmayan anahtar gecersiz kilinacaktir.')) {
      return;
    }
    try {
      const newKey = await subscriptionMutations.generateLicense.mutateAsync(targetCompanyId);
      setBanner({ type: 'success', text: `Yeni lisans anahtari uretildi: ${newKey}` });
    } catch (error: unknown) {
      setBanner({ type: 'error', text: readError(error, 'Lisans anahtari uretilemedi') });
    }
  };

  const saveSubscriptionPlan = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!selectedSubscriptionRow) {
      return;
    }
    if (subscriptionPlanForm.note.trim().length < 3) {
      setBanner({ type: 'error', text: 'Manuel plan guncellemesi icin not zorunludur' });
      return;
    }
    try {
      await subscriptionMutations.savePlan.mutateAsync({
        companyId: selectedSubscriptionRow.company.id,
        note: subscriptionPlanForm.note.trim(),
        packageExpiresAt: subscriptionPlanForm.packageExpiresAt,
        packageGraceDays: subscriptionPlanForm.packageGraceDays,
        packageStartedAt: subscriptionPlanForm.packageStartedAt,
        packageStatus: subscriptionPlanForm.packageStatus,
      });
      setBanner({ type: 'success', text: 'Paket plani guncellendi' });
      setSubscriptionPlanForm((current) => ({ ...current, note: '' }));
    } catch (error: unknown) {
      setBanner({ type: 'error', text: readError(error, 'Paket plani guncellenemedi') });
    }
  };

  const submitCompanyProvisioning = async (
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();

    if (subscriptionProvisionForm.templateCode.trim().length === 0) {
      setBanner({ type: 'error', text: 'Provision icin bir template secin' });
      return;
    }
    if (subscriptionProvisionForm.adminPassword.trim().length < 6) {
      setBanner({ type: 'error', text: 'Admin sifresi en az 6 karakter olmali' });
      return;
    }
    if (
      subscriptionProvisionForm.companyId.trim().length === 0 &&
      subscriptionProvisionForm.companyName.trim().length < 2
    ) {
      setBanner({
        type: 'error',
        text: 'Yeni firma adi girin veya mevcut firma id secin',
      });
      return;
    }
    if (
      subscriptionProvisionForm.companyId.trim().length === 0 &&
      subscriptionProvisionForm.adminEmail.trim().length === 0
    ) {
      setBanner({
        type: 'error',
        text: 'Yeni firma acilisinda admin email zorunludur',
      });
      return;
    }

    try {
      const result = await subscriptionMutations.provisionCompany.mutateAsync(
        subscriptionProvisionForm,
      );
      setSubscriptionSelectedCompanyId(result.company.id);
      setSubscriptionProvisionForm((current) => ({
        ...current,
        adminEmail: current.adminEmail.trim().toLowerCase(),
        adminPassword: '',
        companyId: result.company.id,
        companyName: result.company.name,
      }));
      setBanner({
        type: 'success',
        text: `Provision tamamlandi: ${result.company.name} (${result.template.code}) - Lisans Kodu: ${result.company.licenseKey || ''}`,
      });
    } catch (error: unknown) {
      setBanner({
        type: 'error',
        text: readError(error, 'Provision islemi tamamlanamadi'),
      });
    }
  };

  const applySubscriptionFilters = (): void => {
    setAppliedSubscriptionFilters(subscriptionFilters);
  };

  const resetSubscriptionFilters = (): void => {
    const defaults: SubscriptionFilters = {
      dueInDays: '30',
      search: '',
      status: '',
    };
    setSubscriptionFilters(defaults);
    setAppliedSubscriptionFilters(defaults);
    setSubscriptionSort('DUE_ASC');
  };

  const onCompanyChange = (nextCompanyId: string): void => {
    setCompanyId(nextCompanyId);
  };

  const onBranchChange = (nextBranchId: string): void => {
    setBranchId(nextBranchId);
  };

  const onLogout = (): void => {
    auth.logout();
    setBanner({ type: 'success', text: 'Cikis yapildi' });
  };

  if (!auth.isAuthenticated) {
    if (location.pathname === '/payment-success') {
      return <PaymentSuccessPage />;
    }
    if (location.pathname === '/landing') {
      return (
        <LandingPage
          onNavigateToLogin={() => navigate('/login')}
          onNavigateToSuccess={(companyId) => navigate(`/payment-success?companyId=${companyId}`)}
        />
      );
    }
    return (
      <LoginView
        accessBlockedMessage={auth.accessBlockedMessage}
        banner={banner}
        login={loginForm}
        onChangeEmail={(value) => setLoginForm((current) => ({ ...current, email: value }))}
        onChangeCompanyId={(value) => setLoginForm((current) => ({ ...current, companyId: value }))}
        onChangeMode={(mode) => setLoginForm((current) => ({ ...current, mode }))}
        onChangePassword={(value) => setLoginForm((current) => ({ ...current, password: value }))}
        onChangeUsername={(value) => setLoginForm((current) => ({ ...current, username: value }))}
        onSubmit={onLogin}
        saving={isAuthenticating}
      />
    );
  }

const appShellProps = {
  activeTab,
  allowedTabs,
  banner,
  branchId,
  branches,
  canSelectCompany: auth.isSuperAdmin,
  companies,
  companyId,
  onBranchChange,
  onCompanyChange,
  onLogout,
  onRefresh: () => { void refreshDashboard(); },
  onTabChange: moveToTab,
  refreshDisabled: saving,
  refreshLabel: isRefreshing ? 'Yenileniyor...' : 'Veriyi Yenile',
  userFullName: auth.session?.user.fullName ?? auth.session?.user.username ?? '-',
  userRole: auth.role ?? '-',
};

  if (!auth.isAuthenticated) {
    return (
      <LoginView
        accessBlockedMessage={auth.accessBlockedMessage}
        banner={banner}
        login={loginForm}
        onChangeEmail={(value) => setLoginForm((current) => ({ ...current, email: value }))}
        onChangeCompanyId={(value) => setLoginForm((current) => ({ ...current, companyId: value }))}
        onChangeMode={(mode) => setLoginForm((current) => ({ ...current, mode }))}
        onChangePassword={(value) => setLoginForm((current) => ({ ...current, password: value }))}
        onChangeUsername={(value) => setLoginForm((current) => ({ ...current, username: value }))}
        onSubmit={onLogin}
        saving={isAuthenticating}
      />
    );
  }

  return (
    <AppShell {...appShellProps}>
      {requiresCompanySelection && (
        <section className="card">
          <h2>Firma Secimi Gerekli</h2>
          <p className="muted">
            SUPER_ADMIN olarak devam etmek icin once ust bardan bir firma secin. Firma secilmeden
            organizasyon, katalog, stok, kullanici ve rapor modulleri acilmaz.
          </p>
        </section>
      )}

      {activeTab === 'dashboard' && (
        <DashboardPage companyId={companyId} branchId={branchId} toMoney={money} toDateTime={toDateTime} />
      )}

      {activeTab === 'setup' && auth.isSuperAdmin && (
        <SetupWizardPage
          existingCompanies={companies.map((c: any) => ({
            id: c.id,
            licenseKey: c.licenseKey,
            licenseKeyActivatedAt: c.licenseKeyActivatedAt,
            name: c.name,
            taxNumber: c.taxNumber,
          }))}
          onProvisionFormChange={setSubscriptionProvisionForm}
          onSubmitProvision={submitCompanyProvisioning}
          provisionErrorText={
            subscriptionMutations.provisionCompany.isError
              ? readError(subscriptionMutations.provisionCompany.error, 'Provision islemi hata verdi')
              : null
          }
          provisionForm={subscriptionProvisionForm}
          provisionLoading={subscriptionMutations.provisionCompany.isPending}
          saving={saving}
          templateErrorText={subscriptionTemplateErrorText}
          templateLoading={subscriptionTemplatesQuery.isFetching}
          templates={subscriptionTemplates}
        />
      )}

      {!requiresCompanySelection && activeTab === 'organization' && (
        <OrganizationPage
          branchErrorText={branchesErrorText}
          branchCreateForm={branchCreateForm}
          branchEditForm={branchEditForm}
          branchId={branchId}
          branchLoading={branchesQuery.isFetching}
          branches={branches}
          companiesErrorText={companiesErrorText}
          companiesLoading={companiesQuery.isFetching}
          companies={companies}
          companyCreateForm={companyCreateForm}
          companyEditForm={companyEditForm}
          companyId={companyId}
          onBranchCreate={createBranch}
          onBranchDelete={deleteBranch}
          onBranchEditChange={setBranchEditForm}
          onBranchSelect={setBranchId}
          onBranchUpdate={updateBranch}
          onCompanyCreate={createCompany}
          onCompanyCreateChange={setCompanyCreateForm}
          onCompanyDelete={deleteCompany}
          onCompanyEditChange={setCompanyEditForm}
          onCompanySelect={setCompanyId}
          onCompanyUpdate={updateCompany}
          onInvoiceTemplateFormChange={setInvoiceTemplateForm}
          onInvoiceTemplateSave={saveInvoiceTemplate}
          onNewBranchChange={setBranchCreateForm}
          saving={saving}
          selectedBranch={selectedBranch}
          selectedCompany={selectedCompany}
          selectedCompanyName={selectedCompanyName}
          invoiceTemplateForm={invoiceTemplateForm}
        />
      )}

      {!requiresCompanySelection && activeTab === 'catalog' && (
        <CatalogPage
          bulkForm={bulkProductForm}
          categories={categories}
          categoriesErrorText={categoriesErrorText}
          categoriesLoading={categoriesQuery.isFetching}
          categoryEditForm={categoryEditForm}
          categoryForm={categoryForm}
          companyId={companyId}
          onAddCategory={addCategory}
          onAddProduct={addProduct}
          onApplyBulk={applyBulkProducts}
          onBulkFormChange={setBulkProductForm}
          onCategoryEditFormChange={setCategoryEditForm}
          onCategoryFormChange={setCategoryForm}
          onDeleteCategory={deleteCategory}
          onDeleteProduct={deleteProduct}
          onPreviewBulk={previewBulkProducts}
          onProductEditFormChange={setProductEditForm}
          onProductFiltersChange={setProductFilters}
          onProductFormChange={setProductForm}
          onSelectCategory={setSelectedCategoryId}
          onSelectProduct={setSelectedProductId}
          onToggleProductActive={toggleProductActive}
          onUpdateCategory={updateCategory}
          onUpdateProduct={updateProduct}
          onSetupDefaults={setupDefaultCatalog}
          productEditForm={productEditForm}
          productFilters={productFilters}
          productForm={productForm}
          products={products}
          productsErrorText={productsErrorText}
          productsLoading={productsQuery.isFetching}
          saving={saving}
          selectedCategoryId={selectedCategoryId}
          selectedProductId={selectedProductId}
          suppliers={suppliers}
          toMoney={money}
        />
      )}

      {!requiresCompanySelection && activeTab === 'stock' && (
        <StockPage
          branchId={branchId}
          movementForm={movementForm}
          movementFilters={stockMovementFilters}
          onMovementFormChange={setMovementForm}
          onMovementFiltersChange={applyStockMovementFilters}
          onSubmitMovement={addStockMovement}
          products={products}
          saving={saving}
          selectedBranchName={selectedBranchName}
          stockLevelsErrorText={stockLevelsErrorText}
          stockLevelsLoading={stockLevelsQuery.isFetching}
          stockLevels={stockLevels}
          stockMovementsErrorText={stockMovementsErrorText}
          stockMovementsLoading={stockMovementsQuery.isFetching}
          stockMovements={stockMovements}
          toDateTime={toDateTime}
        />
      )}

      {!requiresCompanySelection && activeTab === 'transfers' && (
        <StockTransfersPage
          branches={branches}
          products={products}
          transfers={stockTransfersData?.data ?? []}
          transfersLoading={stockTransfersQuery.isFetching}
          transfersError={stockTransfersQuery.isError ? readError(stockTransfersQuery.error, 'Transferler yuklenemedi') : null}
          transfersPagination={{ page: transferPage, totalPages: stockTransfersData?.pagination?.totalPages ?? 1, total: stockTransfersData?.pagination?.total ?? (stockTransfersData?.data?.length ?? 0) }}
          onTransfersPageChange={setTransferPage}
          statusFilter={transferStatusFilter}
          onStatusFilterChange={setTransferStatusFilter}
          selectedTransferId={selectedTransferId}
          onSelectTransfer={setSelectedTransferId}
          transferDetail={transferDetailQuery.data ?? null}
          transferDetailLoading={transferDetailQuery.isFetching}
          onCreateTransfer={(payload) => { void stockTransferMutations.create.mutateAsync(payload); }}
          isCreating={stockTransferMutations.create.isPending}
          onUpdateTransferStatus={(id, status, note) => { void stockTransferMutations.updateStatus.mutateAsync({ id, status, note }); }}
          isUpdatingStatus={stockTransferMutations.updateStatus.isPending}
          toDateTime={toDateTime}
        />
      )}

      {!requiresCompanySelection && activeTab === 'users' && (
        <UsersPage
          branches={branches}
          canCreateUser={canCreateUsersInHierarchy}
          canEditSelectedUser={canEditSelectedUser}
          companyId={companyId}
          createRoleOptions={userCreateRoleOptions}
          editRoleOptions={userEditRoleOptions}
          isSelfUserSelected={isSelectedUserSelf}
          onCreateUser={createUser}
          onDeleteUser={deleteUser}
          onSelectUser={setSelectedUserId}
          onUpdateUser={updateUser}
          onUserCreateFormChange={setUserCreateForm}
          onUserEditFormChange={setUserEditForm}
          saving={saving}
          selectedUser={selectedUser}
          selectedUserRestrictionMessage={selectedUserRestrictionMessage}
          selectedUserId={selectedUserId}
          toDateTime={toDateTime}
          usersErrorText={usersErrorText}
          usersLoading={usersQuery.isFetching}
          userCreateForm={userCreateForm}
          userEditForm={userEditForm}
          users={users}
        />
      )}

      {!requiresCompanySelection && activeTab === 'reports' && (
        <ReportsPage
          branchComparisonErrorText={reportsErrorText}
          branchComparisonRows={branchComparisonRows}
          dailyDate={dailyDate}
          dailyReport={dailyReport}
          loadingOperationsHealth={operationsHealthQuery.isFetching}
          loadingReports={reportsMutation.isPending}
          onApplyRangePreset={applyRangePreset}
          onDailyDateChange={setDailyDate}
          onLoadReports={() => {
            void loadReports();
          }}
          onReportRangeChange={setReportRange}
          onReportRegisterChange={setReportRegisterId}
          operationsHealth={operationsHealthQuery.data ?? null}
          operationsHealthErrorText={operationsHealthErrorText}
          registers={registers}
          reportKpis={reportKpis}
          reportRange={reportRange}
          reportRegisterId={reportRegisterId}
          sessionsErrorText={reportsErrorText}
          sessions={sessions}
          topProductsErrorText={reportsErrorText}
          toDateTime={toDateTime}
          toMoney={money}
          topProducts={topProducts}
          profitabilityReport={profitabilityReport}
          expiringProducts={expiringProducts}
          ledgerSummary={ledgerSummary}
        />
      )}

      {!requiresCompanySelection && activeTab === 'customers' && (
        <CustomersPage
          companyId={companyId}
          customers={customersQuery.data?.data ?? []}
          customersLoading={customersQuery.isFetching}
          customersError={customersQuery.isError ? readError(customersQuery.error, 'Musteriler yuklenemedi') : null}
          selectedCustomerId={selectedCustomerId}
          onSelectCustomer={setSelectedCustomerId}
          customerSearch={customerSearch}
          onCustomerSearchChange={setCustomerSearch}
          customerForm={customerForm}
          onCustomerFormChange={setCustomerForm}
          onCreateCustomer={() => { void customerMutations.create.mutateAsync({ companyId, payload: customerForm }); setCustomerForm({ name: '', phone: '', email: '', address: '', taxNumber: '' }); }}
          isCreating={customerMutations.create.isPending}
          customerEditForm={customerEditForm}
          onCustomerEditFormChange={setCustomerEditForm}
          onUpdateCustomer={() => { void customerMutations.update.mutateAsync({ id: selectedCustomerId, payload: customerEditForm }); }}
          isUpdating={customerMutations.update.isPending}
          onDeleteCustomer={() => { void customerMutations.remove.mutateAsync(selectedCustomerId); setSelectedCustomerId(''); }}
          isDeleting={customerMutations.remove.isPending}
          transactions={customerTransactionsQuery.data ?? []}
          transactionsLoading={customerTransactionsQuery.isFetching}
          transactionForm={transactionForm}
          onTransactionFormChange={setTransactionForm}
          onCreateTransaction={() => { void customerMutations.createTransaction.mutateAsync({ customerId: selectedCustomerId, payload: { type: transactionForm.type, amount: Number(transactionForm.amount), description: transactionForm.description || undefined } }); setTransactionForm({ type: 'DEBT', amount: '', description: '' }); }}
          isCreatingTransaction={customerMutations.createTransaction.isPending}
          toMoney={money}
          toDateTime={toDateTime}
        />
      )}

      {!requiresCompanySelection && activeTab === 'sales' && (
        <SalesPage
          sales={salesData?.data ?? []}
          salesLoading={salesQuery.isFetching}
          salesError={salesQuery.isError ? readError(salesQuery.error, 'Satislar yuklenemedi') : null}
          salesPagination={{ page: salesPage, totalPages: salesData?.pagination?.totalPages ?? 1, total: salesData?.pagination?.total ?? (salesData?.data?.length ?? 0) }}
          onSalesPageChange={setSalesPage}
          salesFrom={salesFrom}
          salesTo={salesTo}
          onSalesFromChange={setSalesFrom}
          onSalesToChange={setSalesTo}
          onLoadSales={() => void salesQuery.refetch()}
          receiptSearch={receiptSearch}
          onReceiptSearchChange={setReceiptSearch}
          onSearchReceipt={() => setAppliedReceiptSearch(receiptSearch)}
          selectedSaleId={selectedSaleId}
          onSelectSale={setSelectedSaleId}
          saleDetail={saleDetailQuery.data ?? null}
          saleDetailLoading={saleDetailQuery.isFetching}
          refunds={refundsQuery.data ?? []}
          refundsLoading={refundsQuery.isFetching}
          toMoney={money}
          toDateTime={toDateTime}
        />
      )}

      {!requiresCompanySelection && activeTab === 'suppliers' && (
        <SuppliersPage branchId={branchId} companyId={companyId} products={products} toMoney={money} />
      )}

      {activeTab === 'subscription' && auth.isSuperAdmin && (
        <SubscriptionPage
          actionNote={subscriptionActionNote}
          auditErrorText={subscriptionAuditErrorText}
          auditLoading={subscriptionAuditQuery.isFetching}
          auditPagination={subscriptionAuditPagination}
          auditRows={subscriptionAuditRows}
          dueLimit={subscriptionDueLimit}
          filters={subscriptionFilters}
          onActionNoteChange={setSubscriptionActionNote}
          onApplyFilters={applySubscriptionFilters}
          onExportUpcoming={() => exportSubscriptionRows(upcomingRenewals, 'subscription-upcoming.csv')}
          onExportWholeList={() => exportSubscriptionRows(sortedSubscriptionRows, 'subscription-list.csv')}
          onFiltersChange={setSubscriptionFilters}
          onPlanFormChange={setSubscriptionPlanForm}
          onQuickRenew={(targetCompanyId) => {
            void renewSubscription(targetCompanyId);
          }}
          onQuickRenewSelected={() => {
            if (subscriptionSelectedCompanyId.length > 0) {
              void renewSubscription(subscriptionSelectedCompanyId);
            }
          }}
          onReloadAudit={() => {
            void reloadAudit();
          }}
          onResetFilters={resetSubscriptionFilters}
          recentActivityRows={systemAuditRows.slice(0, 10)}
          onSavePlan={(event) => {
            void saveSubscriptionPlan(event);
          }}
          onSelectCompany={setSubscriptionSelectedCompanyId}
          onSortChange={setSubscriptionSort}
          onSuspend={(targetCompanyId) => {
            void suspendSubscription(targetCompanyId);
          }}
          onUnsuspend={(targetCompanyId) => {
            void unsuspendSubscription(targetCompanyId);
          }}
          onGenerateLicenseKey={(targetCompanyId) => {
            void generateLicenseKeyForCompany(targetCompanyId);
          }}
          onNavigateToSetup={(companyId) => {
            setSubscriptionProvisionForm((current) => ({ ...current, companyId }));
            moveToTab('setup');
          }}
          planForm={subscriptionPlanForm}
          rows={sortedSubscriptionRows}
          saving={saving}
          selectedRow={selectedSubscriptionRow}
          selectedRowId={subscriptionSelectedCompanyId}
          sort={subscriptionSort}
          statuses={SUBSCRIPTION_STATUSES}
          subscriptionErrorText={subscriptionErrorText}
          subscriptionLoading={subscriptionCompaniesQuery.isFetching}
          summary={subscriptionSummary}
          toDateTime={toDateTime}
          upcomingRenewals={upcomingRenewals}
        />
      )}

      {activeTab === 'audit' && auth.isSuperAdmin && (
        <AuditLogPage
          rows={systemAuditRows}
          loading={systemAuditQuery.isFetching}
          errorText={systemAuditErrorText}
          toDateTime={toDateTime}
        />
      )}

      {activeTab === 'yonetim' && auth.isSuperAdmin && (
        <YonetimPage
          saving={saving}
          onSetBanner={(b) => setBanner(b)}
        />
      )}
    </AppShell>
  );
}
