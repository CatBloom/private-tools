import { normalizeMerchant } from "./format";
import type {
  MerchantMonthlySummary,
  MerchantSummary,
  MonthlyTotal,
  Transaction
} from "./types";

const sumAmounts = (transactions: Transaction[]) =>
  transactions.reduce((sum, transaction) => sum + transaction.amount, 0);

const filterByMerchantKey = (transactions: Transaction[], merchantKey: string) =>
  transactions.filter((transaction) => transaction.merchantKey === merchantKey);

const buildMonthlyAmountMap = (transactions: Transaction[]) => {
  const amounts = new Map<string, number>();

  transactions.forEach((transaction) => {
    const key = `${transaction.year}-${transaction.month}`;
    amounts.set(key, (amounts.get(key) ?? 0) + transaction.amount);
  });

  return amounts;
};

const toDateKey = (date: string) => {
  const match = date.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);

  if (!match) {
    return Number.MAX_SAFE_INTEGER;
  }

  const [, year, month, day] = match;
  return Number(`${year}${month.padStart(2, "0")}${day.padStart(2, "0")}`);
};

export const compareTransactionDateAsc = (
  left: Pick<Transaction, "date" | "sortableDate">,
  right: Pick<Transaction, "date" | "sortableDate">
) => toDateKey(left.sortableDate ?? left.date) - toDateKey(right.sortableDate ?? right.date);

export const filterTransactions = (
  transactions: Transaction[],
  year: string,
  month: string,
  merchantQuery: string
) => {
  const normalizedQuery = normalizeMerchant(merchantQuery);

  return transactions
    .filter((transaction) => transaction.year === year && transaction.month === month)
    .filter((transaction) =>
      normalizedQuery
        ? transaction.normalizedMerchant.includes(normalizedQuery)
        : true
    )
    .sort(compareTransactionDateAsc);
};

export const summarizeMerchants = (
  transactions: Transaction[]
): MerchantSummary[] => {
  const map = new Map<string, MerchantSummary>();

  transactions.forEach((transaction) => {
    const current = map.get(transaction.merchantKey);

    if (current) {
      current.totalAmount += transaction.amount;
      current.count += 1;
      return;
    }

    map.set(transaction.merchantKey, {
      merchant: transaction.merchantLabel,
      merchantKey: transaction.merchantKey,
      normalizedMerchant: transaction.normalizedMerchant,
      totalAmount: transaction.amount,
      count: 1
    });
  });

  return [...map.values()].sort((left, right) => right.totalAmount - left.totalAmount);
};

export const summarizePeriod = (transactions: Transaction[]) => ({
  totalAmount: sumAmounts(transactions),
  count: transactions.length
});

export const collapseTopN = (
  data: { name: string; value: number }[],
  limit: number,
  otherLabel = "その他"
) => {
  const top = data.slice(0, limit);
  const otherTotal = data.slice(limit).reduce((sum, row) => sum + row.value, 0);

  return otherTotal !== 0 ? [...top, { name: otherLabel, value: otherTotal }] : top;
};

export const buildPieData = (transactions: Transaction[]) =>
  collapseTopN(
    summarizeMerchants(transactions).map((row) => ({
      name: row.merchant,
      value: row.totalAmount
    })),
    10
  );

const buildMonthAxis = (year: string): MonthlyTotal[] =>
  Array.from({ length: 12 }, (_, index) => {
    const month = String(index + 1).padStart(2, "0");
    return {
      key: `${year}-${month}`,
      label: `${index + 1}月`,
      year,
      month,
      amount: 0
    };
  });

export const buildYearlyTrend = (
  transactions: Transaction[],
  year: string
): MonthlyTotal[] => {
  const result = buildMonthAxis(year);

  transactions
    .filter((transaction) => transaction.year === year)
    .forEach((transaction) => {
      const slot = result[Number(transaction.month) - 1];
      slot.amount += transaction.amount;
    });

  return result;
};

export const buildMerchantTrendAll = (
  transactions: Transaction[],
  merchant: string
): MonthlyTotal[] => {
  const filtered = filterByMerchantKey(transactions, merchant);
  const monthlyAmounts = buildMonthlyAmountMap(filtered);

  return [...monthlyAmounts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([period, amount]) => {
      const [year, month] = period.split("-");

      return {
        key: period,
        label: `${year}/${Number(month)}`,
        year,
        month,
        amount
      };
    });
};

export const buildMerchantTrendYear = (
  transactions: Transaction[],
  merchant: string,
  year: string
) =>
  buildYearlyTrend(filterByMerchantKey(transactions, merchant), year);

export const summarizeMerchantByMonth = (
  transactions: Transaction[]
): MerchantMonthlySummary[] => {
  const map = new Map<string, MerchantMonthlySummary>();

  transactions.forEach((transaction) => {
    const key = `${transaction.year}-${transaction.month}`;
    const current = map.get(key);

    if (current) {
      current.totalAmount += transaction.amount;
      return;
    }

    map.set(key, {
      key,
      periodLabel: `${transaction.year}/${transaction.month}`,
      totalAmount: transaction.amount
    });
  });

  return [...map.values()].sort((left, right) => left.key.localeCompare(right.key));
};
