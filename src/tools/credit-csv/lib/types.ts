export type Transaction = {
  id: string;
  date: string;
  sortableDate: string;
  merchant: string;
  normalizedMerchant: string;
  merchantKey: string;
  merchantLabel: string;
  amount: number;
  year: string;
  month: string;
  sourceFile: string;
};

export type PeriodOption = {
  year: string;
  month: string;
};

export type MerchantSummary = {
  merchant: string;
  merchantKey: string;
  normalizedMerchant: string;
  totalAmount: number;
  count: number;
};

export type MonthlyTotal = {
  key: string;
  label: string;
  year: string;
  month: string;
  amount: number;
};

export type MerchantMonthlySummary = {
  key: string;
  periodLabel: string;
  totalAmount: number;
};

export type ViewMode = "detail" | "monthly-summary";

export type AppData = {
  transactions: Transaction[];
  years: string[];
  monthsByYear: Record<string, string[]>;
  latestPeriod: PeriodOption;
};
