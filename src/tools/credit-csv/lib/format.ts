export const MERCHANT_SIMILARITY_THRESHOLD = 0.8;

export const formatCurrency = (value: number) =>
  new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0
  }).format(value);

export const formatMonthLabel = (month: string) => `${Number(month)}月`;

export const formatDisplayDate = (date: string) => {
  const fullDateMatch = date.match(/^\d{4}\/(\d{1,2})\/(\d{1,2})$/);

  if (fullDateMatch) {
    const [, month, day] = fullDateMatch;
    return `${month.padStart(2, "0")}/${day.padStart(2, "0")}`;
  }

  const shortDateMatch = date.match(/^(\d{1,2})\/(\d{1,2})$/);

  if (shortDateMatch) {
    const [, month, day] = shortDateMatch;
    return `${month.padStart(2, "0")}/${day.padStart(2, "0")}`;
  }

  return date;
};

export const normalizeMerchant = (merchant: string) =>
  merchant.normalize("NFKC").trim();

export const formatMerchantLabel = (merchant: string) =>
  normalizeMerchant(merchant)
    .replace(/[（(].*?[）)]/gu, "")
    .replace(
      /(?<=[\p{Script=Han}\p{Script=Katakana}\p{Script=Hiragana}])[ｰ－—―‐-]+(?=[\p{Script=Han}\p{Script=Katakana}\p{Script=Hiragana}])/gu,
      ""
    )
    .replace(/\s*\/?\s*iD\b/g, "")
    .replace(/[\p{P}\p{S}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

export const normalizeMerchantGroupKey = (merchant: string) =>
  formatMerchantLabel(merchant)
    .replace(/[\p{P}\p{S}]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();

export const normalizeMerchantComparable = (merchant: string) =>
  normalizeMerchantGroupKey(merchant).toLowerCase().replace(/\s+/gu, "");

const buildBigrams = (value: string) => {
  if (value.length <= 1) {
    return [value];
  }

  return Array.from({ length: value.length - 1 }, (_, index) =>
    value.slice(index, index + 2)
  );
};

export const calculateMerchantSimilarity = (left: string, right: string) => {
  if (left === right) {
    return 1;
  }

  if (!left || !right) {
    return 0;
  }

  const leftBigrams = buildBigrams(left);
  const rightBigrams = buildBigrams(right);
  const rightCounts = new Map<string, number>();

  rightBigrams.forEach((bigram) => {
    rightCounts.set(bigram, (rightCounts.get(bigram) ?? 0) + 1);
  });

  let intersection = 0;

  leftBigrams.forEach((bigram) => {
    const count = rightCounts.get(bigram) ?? 0;

    if (count > 0) {
      intersection += 1;
      rightCounts.set(bigram, count - 1);
    }
  });

  return (2 * intersection) / (leftBigrams.length + rightBigrams.length);
};
