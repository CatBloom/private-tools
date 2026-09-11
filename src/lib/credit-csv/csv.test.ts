import { describe, expect, it } from "vitest";
import {
  buildAppData,
  buildPeriodIndex,
  decodeShiftJis,
  parseCsvText,
  parseFilenamePeriod,
  parseUploadedCsv,
  splitCsvLine
} from "./csv";
import {
  calculateMerchantSimilarity,
  formatMerchantLabel,
  normalizeMerchant,
  normalizeMerchantComparable,
  normalizeMerchantGroupKey
} from "./format";

const toBytes = (text: string): ArrayBuffer => {
  const buffer = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) {
    buffer[index] = text.charCodeAt(index);
  }
  return buffer.buffer;
};

describe("csv helpers", () => {
  it("parses filename periods from YYYYMM.csv only", () => {
    expect(parseFilenamePeriod("../../data/202605.csv")).toEqual({
      year: "2026",
      month: "05"
    });
    expect(parseFilenamePeriod("../../data/readme.txt")).toBeNull();
  });

  it("splits csv lines with quoted commas", () => {
    expect(splitCsvLine('2026/4/1,"A,B",x,x,,\'26/05,500,500')).toEqual([
      "2026/4/1",
      "A,B",
      "x",
      "x",
      "",
      "'26/05",
      "500",
      "500"
    ]);
  });

  it("creates transactions from valid rows and skips invalid ones", () => {
    const rows = parseCsvText(
      "202605.csv",
      { year: "2026", month: "05" },
      ["2026/4/1,Store A,x,x,,'26/05,500,500", ",Store B,x,x,,'26/05,500,500"].join(
        "\n"
      )
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      date: "2026/4/1",
      sortableDate: "2026/04/01",
      merchant: "Store A",
      amount: 500,
      year: "2026",
      month: "04"
    });
  });

  it("completes MM/DD dates with the file year", () => {
    const rows = parseCsvText(
      "202605.csv",
      { year: "2026", month: "05" },
      "04/23,Store A,x,x,,'26/05,500,500"
    );

    expect(rows[0]).toMatchObject({
      date: "04/23",
      sortableDate: "2026/04/23",
      year: "2026",
      month: "04"
    });
  });

  it("builds years and months in ascending order and latest usage period", () => {
    const index = buildPeriodIndex([
      { year: "2026", month: "04" },
      { year: "2025", month: "12" },
      { year: "2026", month: "01" }
    ]);

    expect(index.years).toEqual(["2025", "2026"]);
    expect(index.monthsByYear["2026"]).toEqual(["01", "04"]);
    expect(index.latestPeriod).toEqual({ year: "2026", month: "04" });
  });

  it("removes parenthesized suffixes and normalizes whitespace", () => {
    expect(normalizeMerchantGroupKey("GRYPHLINE (NA )")).toBe("GRYPHLINE");
    expect(normalizeMerchantGroupKey("AMAZON  WEB  SERVICES")).toBe(
      "AMAZON WEB SERVICES"
    );
  });

  it("converts full-width alphanumerics to half-width", () => {
    expect(normalizeMerchant("ＡＭＡＺＯＮ　ＷＥＢ　ＳＥＲＶＩＣＥＳ")).toBe(
      "AMAZON WEB SERVICES"
    );
  });

  it("removes iD suffixes from labels", () => {
    expect(formatMerchantLabel("セブン－イレブン iD")).toBe("セブンイレブン");
  });

  it("treats minor missing-character differences as similar", () => {
    const left = normalizeMerchantComparable("GOOGLE *YOUTUBEPREMIUM (LONDON )");
    const right = normalizeMerchantComparable("GOOGLE YOUTUBEPREMIU");
    expect(calculateMerchantSimilarity(left, right)).toBeGreaterThanOrEqual(0.8);
  });
});

describe("decodeShiftJis", () => {
  it("decodes shift-jis bytes into text", () => {
    // 0x82 0xa0 は「あ」の Shift_JIS エンコード
    expect(decodeShiftJis(new Uint8Array([0x82, 0xa0]))).toBe("あ");
  });
});

describe("parseUploadedCsv", () => {
  it("parses a YYYYMM.csv upload into transactions", () => {
    const bytes = toBytes("2026/4/1,Store A,x,x,,'26/05,500,500");
    const rows = parseUploadedCsv("202605.csv", bytes);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      merchant: "Store A",
      amount: 500,
      sourceFile: "202605.csv"
    });
  });

  it("ignores files whose name does not match YYYYMM.csv", () => {
    const bytes = toBytes("2026/4/1,Store A,x,x,,'26/05,500,500");
    expect(parseUploadedCsv("readme.txt", bytes)).toEqual([]);
  });
});

describe("buildAppData", () => {
  it("builds AppData from a set of uploaded CSV files", () => {
    const appData = buildAppData([
      {
        fileName: "202604.csv",
        bytes: toBytes("2026/4/1,Store A,x,x,,'26/04,500,500")
      },
      {
        fileName: "202605.csv",
        bytes: toBytes("2026/5/1,Store B,x,x,,'26/05,700,700")
      }
    ]);

    expect(appData.transactions).toHaveLength(2);
    expect(appData.years).toEqual(["2026"]);
    expect(appData.monthsByYear["2026"]).toEqual(["04", "05"]);
    expect(appData.latestPeriod).toEqual({ year: "2026", month: "05" });
  });

  it("throws when no files are provided", () => {
    expect(() => buildAppData([])).toThrow(
      "data ディレクトリに CSV ファイルがありません。"
    );
  });

  it("throws when no file yields a readable transaction", () => {
    expect(() =>
      buildAppData([{ fileName: "readme.txt", bytes: toBytes("not csv") }])
    ).toThrow("CSV から表示可能な明細を読み取れませんでした。");
  });
});
