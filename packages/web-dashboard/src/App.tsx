import { useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { AppShell } from './components/AppShell';
import { LoginView } from './components/LoginView';
import { useAuth } from './domain/auth/hooks';
import { useCategoriesQuery, useCatalogMutations, useProductsQuery } from './domain/catalog/hooks';
import type { CategoryForm, ProductForm } from './domain/catalog/types';
import { useBranchesQuery, useBranchMutations, useCompaniesQuery, useCompanyMutations } from './domain/organization/hooks';
import type {
  BranchCreateForm,
  BranchEditForm,
  CompanyCreateForm,
  CompanyEditForm,
} from './domain/organization/types';
import { useOperationsHealthQuery, useReportsMutation } from './domain/reports/hooks';
import type { ReportRange } from './domain/reports/types';
import { useStockLevelsQuery, useStockMovementsQuery, useRegistersQuery, useStockMutations } from './domain/stock/hooks';
import type { StockMovementForm } from './domain/stock/types';
import {
  useProvisionTemplatesQuery,
  useSubscriptionAuditQuery,
  useSubscriptionCompaniesQuery,
  useSubscriptionMutations,
} from './domain/subscription/hooks';
import type {
  SubscriptionFilters,
  SubscriptionPlanForm,
  SubscriptionProvisionForm,
  SubscriptionSort,
} from './domain/subscription/types';
import { SUBSCRIPTION_STATUSES, type BranchComparisonRow, type DailyReport, type ReportSession, type TopProduct } from './domain/shared/types';
import { useUsersQuery, useUserMutations } from './domain/users/hooks';
import type { UserCreateForm, UserEditForm } from './domain/users/types';
import { useTabNavigation } from './hooks/use-tab-navigation';
import { downloadCsv, intNum, money, readError, toDateInput, toDateTime, toLocalDateIso } from './lib/format';
import { canManageRole, resolveAssignableRoles } from './lib/role-hierarchy';
import { queryKeys } from './lib/query-keys';
import { CatalogPage } from './pages/CatalogPage';
import { OrganizationPage } from './pages/OrganizationPage';
import { ReportsPage } from './pages/ReportsPage';
import { StockPage } from './pages/StockPage';
import { SubscriptionPage } from './pages/SubscriptionPage';
import { UsersPage } from './pages/UsersPage';

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
  const auth = useAuth();

  const [banner, setBanner] = useState<BannerState | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [loginForm, setLoginForm] = useState({ username: 'admin', password: 'admin123', companyId: '' });

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

  const [dailyReport, setDailyReport] = useState<DailyReport | null>(null);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [sessions, setSessions] = useState<ReportSession[]>([]);
  const [branchComparisonRows, setBranchComparisonRows] = useState<BranchComparisonRow[]>([]);

  const [companyCreateForm, setCompanyCreateForm] = useState<CompanyCreateForm>({
    address: '',
    email: '',
    name: '',
    phone: '',
    taxNumber: '',
  });
  const [companyEditForm, setCompanyEditForm] = useState<CompanyEditForm>({
    address: '',
    email: '',
    isActive: true,
    name: '',
    phone: '',
    taxNumber: '',
  });
  const [branchCreateForm, setBranchCreateForm] = useState<BranchCreateForm>({ address: '', name: '', phone: '' });
  const [branchEditForm, setBranchEditForm] = useState<BranchEditForm>({ address: '', isActive: true, name: '', phone: '' });
  const [categoryForm, setCategoryForm] = useState<CategoryForm>({ color: '#6366f1', name: '', sortOrder: '0' });
  const [productForm, setProductForm] = useState<ProductForm>({
    barcode: '',
    categoryId: '',
    minStock: '0',
    name: '',
    purchasePrice: '0',
    salePrice: '0',
    vatRate: '10',
  });
  const [movementForm, setMovementForm] = useState<StockMovementForm>({ note: '', productId: '', quantity: '0', reference: '' });
  const [userCreateForm, setUserCreateForm] = useState<UserCreateForm>({
    branchId: '',
    fullName: '',
    password: '',
    pin: '',
    role: 'CASHIER',
    username: '',
  });
  const [userEditForm, setUserEditForm] = useState<UserEditForm>({
    branchId: '',
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
  const branches = useMemo(
    () => [...(branchesQuery.data ?? [])].sort((left, right) => left.name.localeCompare(right.name, 'tr')),
    [branchesQuery.data],
  );
  const categoriesQuery = useCategoriesQuery(companyId, auth.isAuthenticated && auth.isBackofficeWriter);
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
  const productsQuery = useProductsQuery(companyId, auth.isAuthenticated && auth.isBackofficeWriter);
  const products = useMemo(
    () => [...(productsQuery.data ?? [])].sort((left, right) => left.name.localeCompare(right.name, 'tr')),
    [productsQuery.data],
  );
  const usersQuery = useUsersQuery(companyId, auth.isAuthenticated && auth.isBackofficeWriter);
  const users = useMemo(
    () => [...(usersQuery.data ?? [])].sort((left, right) => left.fullName.localeCompare(right.fullName, 'tr')),
    [usersQuery.data],
  );
  const stockLevelsQuery = useStockLevelsQuery(branchId, auth.isAuthenticated);
  const stockLevels = useMemo(
    () => [...(stockLevelsQuery.data ?? [])].sort((left, right) => left.product.name.localeCompare(right.product.name, 'tr')),
    [stockLevelsQuery.data],
  );
  const stockMovementsQuery = useStockMovementsQuery(branchId, auth.isAuthenticated);
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

  const selectedCompany = useMemo(() => companies.find((company) => company.id === companyId) ?? null, [companies, companyId]);
  const selectedBranch = useMemo(() => branches.find((branch) => branch.id === branchId) ?? null, [branches, branchId]);
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

  const companyMutations = useCompanyMutations(selectedCompany?.id ?? '');
  const branchMutations = useBranchMutations(companyId, selectedBranch?.id ?? '');
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
    catalogMutations.createCategory.isPending ||
    catalogMutations.createProduct.isPending ||
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

    if (!auth.isBackofficeWriter) {
      setCompanyId(auth.session?.user.companyId ?? '');
      return;
    }

    setCompanyId((current) =>
      current.length > 0 && companies.some((row) => row.id === current) ? current : companies[0]?.id ?? '',
    );
  }, [auth.isAuthenticated, auth.isBackofficeWriter, auth.session?.user.companyId, companies]);

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
      setCompanyEditForm({ address: '', email: '', isActive: true, name: '', phone: '', taxNumber: '' });
      return;
    }
    setCompanyEditForm({
      address: selectedCompany.address ?? '',
      email: selectedCompany.email ?? '',
      isActive: selectedCompany.isActive,
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
    if (!selectedUser) {
      setUserEditForm({
        branchId: '',
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

  const onLogin = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
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

  const createCompany = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    try {
      const created = await companyMutations.createCompany.mutateAsync(companyCreateForm);
      setCompanyId(created.id);
      setCompanyCreateForm({ address: '', email: '', name: '', phone: '', taxNumber: '' });
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

  const addCategory = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (companyId.length === 0) {
      return;
    }
    try {
      await catalogMutations.createCategory.mutateAsync({ ...categoryForm, companyId });
      setCategoryForm({ color: '#6366f1', name: '', sortOrder: '0' });
      setBanner({ type: 'success', text: 'Kategori eklendi' });
    } catch (error: unknown) {
      setBanner({ type: 'error', text: readError(error, 'Kategori eklenemedi') });
    }
  };

  const addProduct = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (companyId.length === 0) {
      return;
    }
    try {
      await catalogMutations.createProduct.mutateAsync({ ...productForm, companyId });
      setProductForm((current) => ({ ...current, barcode: '', minStock: '0', name: '', purchasePrice: '0', salePrice: '0' }));
      setBanner({ type: 'success', text: 'Urun eklendi' });
    } catch (error: unknown) {
      setBanner({ type: 'error', text: readError(error, 'Urun eklenemedi') });
    }
  };

  const addStockMovement = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (branchId.length === 0 || movementForm.productId.length === 0) {
      return;
    }
    try {
      await stockMutations.createStockMovement.mutateAsync({ ...movementForm, branchId });
      setMovementForm((current) => ({ ...current, note: '', quantity: '0', reference: '' }));
      setBanner({ type: 'success', text: 'Stok hareketi kaydedildi' });
    } catch (error: unknown) {
      setBanner({ type: 'error', text: readError(error, 'Stok hareketi kaydedilemedi') });
    }
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
        to: reportRange.to,
      });
      setDailyReport(payload.dailyReport);
      setTopProducts(payload.topProducts);
      setSessions(payload.sessions);
      setBranchComparisonRows(payload.branchComparisonRows);
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
          queryClient.invalidateQueries({ queryKey: queryKeys.products(companyId) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.users(companyId) }),
        ]);
      }
      if (branchId.length > 0) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.stockLevels(branchId) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.stockMovements(branchId) }),
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

    try {
      const result = await subscriptionMutations.provisionCompany.mutateAsync(
        subscriptionProvisionForm,
      );
      setSubscriptionSelectedCompanyId(result.company.id);
      setSubscriptionProvisionForm((current) => ({
        ...current,
        adminPassword: '',
        companyId: result.company.id,
        companyName: result.company.name,
      }));
      setBanner({
        type: 'success',
        text: `Provision tamamlandi: ${result.company.name} (${result.template.code})`,
      });
    } catch (error: unknown) {
      setBanner({
        type: 'error',
        text: readError(error, 'Provision islemi tamamlanamadi'),
      });
    }
  };

  const bindSelectedCompanyToProvision = (): void => {
    if (!selectedSubscriptionRow) {
      setBanner({
        type: 'error',
        text: 'Once paket listesinden bir firma secin',
      });
      return;
    }
    setSubscriptionProvisionForm((current) => ({
      ...current,
      companyId: selectedSubscriptionRow.company.id,
      companyName: selectedSubscriptionRow.company.name,
      taxNumber: selectedSubscriptionRow.company.taxNumber ?? '',
    }));
    setBanner({
      type: 'success',
      text: `"${selectedSubscriptionRow.company.name}" provision hedefine alindi`,
    });
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
    return (
      <LoginView
        accessBlockedMessage={auth.accessBlockedMessage}
        banner={banner}
        login={loginForm}
        onChangeCompanyId={(value) => setLoginForm((current) => ({ ...current, companyId: value }))}
        onChangePassword={(value) => setLoginForm((current) => ({ ...current, password: value }))}
        onChangeUsername={(value) => setLoginForm((current) => ({ ...current, username: value }))}
        onSubmit={onLogin}
        saving={isAuthenticating}
      />
    );
  }

  return (
    <AppShell
      activeTab={activeTab}
      allowedTabs={allowedTabs}
      banner={banner}
      branchId={branchId}
      branches={branches}
      canSelectCompany={auth.isSuperAdmin}
      companies={companies}
      companyId={companyId}
      onBranchChange={onBranchChange}
      onCompanyChange={onCompanyChange}
      onLogout={onLogout}
      onRefresh={() => {
        void refreshDashboard();
      }}
      onTabChange={moveToTab}
      refreshDisabled={saving}
      refreshLabel={isRefreshing ? 'Yenileniyor...' : 'Veriyi Yenile'}
      userFullName={auth.session?.user.fullName ?? auth.session?.user.username ?? '-'}
      userRole={auth.role ?? '-'}
    >
      {activeTab === 'organization' && (
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
          onNewBranchChange={setBranchCreateForm}
          saving={saving}
          selectedBranch={selectedBranch}
          selectedCompany={selectedCompany}
          selectedCompanyName={selectedCompanyName}
        />
      )}

      {activeTab === 'catalog' && (
        <CatalogPage
          categories={categories}
          categoriesErrorText={categoriesErrorText}
          categoriesLoading={categoriesQuery.isFetching}
          categoryForm={categoryForm}
          companyId={companyId}
          onAddCategory={addCategory}
          onAddProduct={addProduct}
          onCategoryFormChange={setCategoryForm}
          onProductFormChange={setProductForm}
          productForm={productForm}
          products={products}
          productsErrorText={productsErrorText}
          productsLoading={productsQuery.isFetching}
          saving={saving}
          toMoney={money}
        />
      )}

      {activeTab === 'stock' && (
        <StockPage
          branchId={branchId}
          movementForm={movementForm}
          onMovementFormChange={setMovementForm}
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

      {activeTab === 'users' && (
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

      {activeTab === 'reports' && (
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
        />
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
          onProvisionFormChange={setSubscriptionProvisionForm}
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
          onSavePlan={(event) => {
            void saveSubscriptionPlan(event);
          }}
          onSubmitProvision={(event) => {
            void submitCompanyProvisioning(event);
          }}
          onSelectCompany={setSubscriptionSelectedCompanyId}
          onSortChange={setSubscriptionSort}
          onSuspend={(targetCompanyId) => {
            void suspendSubscription(targetCompanyId);
          }}
          onUnsuspend={(targetCompanyId) => {
            void unsuspendSubscription(targetCompanyId);
          }}
          onUseSelectedCompanyForProvision={bindSelectedCompanyToProvision}
          planForm={subscriptionPlanForm}
          provisionForm={subscriptionProvisionForm}
          provisionLoading={subscriptionMutations.provisionCompany.isPending}
          provisionErrorText={subscriptionMutations.provisionCompany.isError ? readError(subscriptionMutations.provisionCompany.error, 'Provision islemi hata verdi') : null}
          rows={sortedSubscriptionRows}
          saving={saving}
          selectedRow={selectedSubscriptionRow}
          selectedRowId={subscriptionSelectedCompanyId}
          sort={subscriptionSort}
          statuses={SUBSCRIPTION_STATUSES}
          subscriptionErrorText={subscriptionErrorText}
          subscriptionLoading={subscriptionCompaniesQuery.isFetching}
          templates={subscriptionTemplates}
          templateErrorText={subscriptionTemplateErrorText}
          templateLoading={subscriptionTemplatesQuery.isFetching}
          summary={subscriptionSummary}
          toDateTime={toDateTime}
          upcomingRenewals={upcomingRenewals}
        />
      )}
    </AppShell>
  );
}
