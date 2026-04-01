import type {
  BranchComparisonRow,
  DailyReport,
  OperationsHealthResponse,
  ReportSession,
  TopProduct,
} from '../shared/types';

export type {
  BranchComparisonRow,
  DailyReport,
  OperationsHealthResponse,
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
  to: string;
}

export interface ReportsPayload {
  branchComparisonRows: BranchComparisonRow[];
  dailyReport: DailyReport;
  sessions: ReportSession[];
  topProducts: TopProduct[];
}
