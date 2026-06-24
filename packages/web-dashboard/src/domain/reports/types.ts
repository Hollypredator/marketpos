import type {
  BranchComparisonRow,
  DailyReport,
  OperationsHealthResponse,
  ProfitabilityReport,
  LedgerSummary,
  ExpiringProduct,
  ReportSession,
  TopProduct,
} from '../shared/types';

export type {
  BranchComparisonRow,
  DailyReport,
  LedgerSummary,
  OperationsHealthResponse,
  ProfitabilityReport,
  ExpiringProduct,
  ReportSession,
  TopProduct,
};

export interface ReportRange {
  from: string;
  to: string;
}

export interface ReportsParams {
  branchId: string;
  companyId?: string;
  dailyDate: string;
  from: string;
  registerId: string;
  sessionLimit?: number;
  to: string;
}

export interface ReportsPayload {
  branchComparisonRows: BranchComparisonRow[];
  dailyReport: DailyReport;
  sessions: ReportSession[];
  topProducts: TopProduct[];
  profitabilityReport: ProfitabilityReport;
  expiringProducts: ExpiringProduct[];
  ledgerSummary: LedgerSummary;
}
