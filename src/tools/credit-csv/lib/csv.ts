import {
  calculateMerchantSimilarity,
  formatMerchantLabel,
  MERCHANT_SIMILARITY_THRESHOLD,
  normalizeMerchant,
  normalizeMerchantComparable,
  normalizeMerchantGroupKey
} from "./format";
import type { AppData, PeriodOption, Transaction } from "./types";

export const parseFilenamePeriod = (filePath: string): PeriodOption | null => {
  const fileName = filePath.split("/").pop() ?? "";
  const match = fileName.match(/^(\d{4})(\d{2})\.csv$/);

  if (!match) {
    return null;
  }

  return { year: match[1], month: match[2] };
};

export const splitCsvLine = (line: string): string[] => {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells;
};

const parseAmount = (columns: string[]): number | null => {
  const candidates = [7, 6, 2, 5, 8, 9, 10, 11, 12]
    .map((index) => columns[index] ?? "")
    .map((value) => value.trim())
    .filter(Boolean);

  for (const candidate of candidates) {
    const normalized = candidate.replaceAll(",", "");
    const amount = Number(normalized);

    if (!Number.isNaN(amount)) {
      return amount;
    }
  }

  return null;
};

const normalizeTransactionDate = (
  rawDate: string,
  period: PeriodOption
): string | null => {
  const fullDateMatch = rawDate.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);

  if (fullDateMatch) {
    const [, year, month, day] = fullDateMatch;
    return `${year}/${month.padStart(2, "0")}/${day.padStart(2, "0")}`;
  }

  const shortDateMatch = rawDate.match(/^(\d{1,2})\/(\d{1,2})$/);

  if (shortDateMatch) {
    const [, month, day] = shortDateMatch;
    return `${period.year}/${month.padStart(2, "0")}/${day.padStart(2, "0")}`;
  }

  return null;
};

const getUsagePeriod = (sortableDate: string): PeriodOption => {
  const match = sortableDate.match(/^(\d{4})\/(\d{2})\/\d{2}$/);

  if (!match) {
    throw new Error(`invalid sortable date: ${sortableDate}`);
  }

  return {
    year: match[1],
    month: match[2]
  };
};

export const parseCsvText = (
  sourceFile: string,
  period: PeriodOption,
  text: string
): Transaction[] => {
  const rows = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const transactions: Transaction[] = [];

  rows.forEach((line, index) => {
    const columns = splitCsvLine(line);
    const date = (columns[0] ?? "").trim();
    const sortableDate = normalizeTransactionDate(date, period);
    const merchant = (columns[1] ?? "").trim();
    const amount = parseAmount(columns);

    // 古い CSV は明細行の前に口座情報の行を含むことがある
    const isTransactionRow = sortableDate !== null;

    if (!isTransactionRow || !merchant || amount === null) {
      return;
    }

    const label = formatMerchantLabel(merchant);
    const normalized = normalizeMerchant(merchant);

    transactions.push({
      id: `${sourceFile}-${index}`,
      date,
      sortableDate,
      merchant: label,
      normalizedMerchant: normalized,
      merchantKey: normalized,
      merchantLabel: label,
      amount,
      ...getUsagePeriod(sortableDate),
      sourceFile
    });
  });

  return transactions;
};

export const assignMerchantGroups = (transactions: Transaction[]) => {
  const groups: Array<{
    key: string;
    label: string;
    comparable: string;
  }> = [];

  return transactions.map((transaction) => {
    const merchantKey = normalizeMerchantGroupKey(transaction.merchant);
    const comparable = normalizeMerchantComparable(transaction.merchant);
    let bestGroup:
      | {
          key: string;
          label: string;
          comparable: string;
        }
      | undefined;
    let bestScore = 0;

    groups.forEach((group) => {
      const score = calculateMerchantSimilarity(comparable, group.comparable);

      if (score >= MERCHANT_SIMILARITY_THRESHOLD && score > bestScore) {
        bestGroup = group;
        bestScore = score;
      }
    });

    if (!bestGroup) {
      bestGroup = {
        key: merchantKey || transaction.normalizedMerchant,
        label: transaction.merchantLabel,
        comparable
      };
      groups.push(bestGroup);
    }

    return {
      ...transaction,
      merchantKey: bestGroup.key,
      merchantLabel: bestGroup.label
    };
  });
};

export const buildPeriodIndex = (
  periods: PeriodOption[]
): Pick<AppData, "years" | "monthsByYear" | "latestPeriod"> => {
  const unique = [...periods].sort((left, right) =>
    `${left.year}${left.month}`.localeCompare(`${right.year}${right.month}`)
  );

  if (unique.length === 0) {
    throw new Error("data ディレクトリに有効な CSV がありません。");
  }

  const years = [...new Set(unique.map((item) => item.year))];
  const monthsByYear = Object.fromEntries(
    years.map((year) => [
      year,
      unique
        .filter((item) => item.year === year)
        .map((item) => item.month)
        .sort((left, right) => Number(left) - Number(right))
    ])
  );

  return {
    years,
    monthsByYear,
    latestPeriod: unique.at(-1)!
  };
};

export const decodeShiftJis = (bytes: ArrayBuffer | Uint8Array): string => {
  const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return new TextDecoder("shift-jis").decode(buffer);
};

export const parseUploadedCsv = (
  fileName: string,
  bytes: ArrayBuffer
): Transaction[] => {
  const period = parseFilenamePeriod(fileName);

  if (!period) {
    return [];
  }

  const sourceFile = fileName.split("/").pop() ?? fileName;
  const text = decodeShiftJis(bytes);
  return parseCsvText(sourceFile, period, text);
};

export const buildAppData = (
  files: { fileName: string; bytes: ArrayBuffer }[]
): AppData => {
  if (files.length === 0) {
    throw new Error("data ディレクトリに CSV ファイルがありません。");
  }

  const sortedFiles = [...files].sort((left, right) => {
    const leftPeriod = parseFilenamePeriod(left.fileName);
    const rightPeriod = parseFilenamePeriod(right.fileName);
    const leftKey = leftPeriod ? `${leftPeriod.year}${leftPeriod.month}` : "";
    const rightKey = rightPeriod ? `${rightPeriod.year}${rightPeriod.month}` : "";
    return leftKey.localeCompare(rightKey);
  });

  const parsedTransactions = sortedFiles.flatMap((file) =>
    parseUploadedCsv(file.fileName, file.bytes)
  );

  const transactions = assignMerchantGroups(parsedTransactions);

  if (transactions.length === 0) {
    throw new Error("CSV から表示可能な明細を読み取れませんでした。");
  }

  return {
    transactions,
    ...buildPeriodIndex(
      [...new Set(transactions.map((transaction) => `${transaction.year}${transaction.month}`))]
        .sort()
        .map((value) => ({
          year: value.slice(0, 4),
          month: value.slice(4, 6)
        }))
    )
  };
};
