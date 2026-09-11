import { describe, expect, it } from "vitest";
import { assignMerchantGroups, parseCsvText } from "../../../lib/credit-csv/csv";
import {
  buildYearlyTrend,
  compareTransactionDateAsc,
  filterTransactions,
  summarizeMerchantByMonth,
  summarizeMerchants
} from "./selectors";

describe("selectors", () => {
  const rows = assignMerchantGroups(
    parseCsvText(
      "202605.csv",
      { year: "2026", month: "05" },
      [
        "2026/4/1,GOOGLE *YOUTUBEPREMIUM (LONDON ),x,x,,'26/05,500,500",
        "04/02,GOOGLE YOUTUBEPREMIU,x,x,,'26/05,700,700",
        "2026/4/3,AMAZON  WEB  SERVICES,x,x,,'26/05,300,300",
        "2026/4/4,AMAZON WEB SERVICES,x,x,,'26/05,200,200"
      ].join("\n")
    )
  );

  it("filters by year, month, and partial merchant name", () => {
    const filtered = filterTransactions(rows, "2026", "04", "GOOGLE");
    expect(filtered).toHaveLength(2);
  });

  it("summarizes merchants by grouping key", () => {
    const summary = summarizeMerchants(rows);
    expect(summary).toEqual([
      {
        merchant: "GOOGLE YOUTUBEPREMIUM",
        merchantKey: "GOOGLE YOUTUBEPREMIUM",
        normalizedMerchant: "GOOGLE *YOUTUBEPREMIUM (LONDON )",
        totalAmount: 1200,
        count: 2
      },
      {
        merchant: "AMAZON WEB SERVICES",
        merchantKey: "AMAZON WEB SERVICES",
        normalizedMerchant: "AMAZON  WEB  SERVICES",
        totalAmount: 500,
        count: 2
      }
    ]);
  });

  it("fills missing months with zero for yearly trend", () => {
    const trend = buildYearlyTrend(rows, "2026");
    expect(trend).toHaveLength(12);
    expect(trend[3].amount).toBe(1700);
    expect(trend[0].amount).toBe(0);
  });

  it("summarizes merchant rows by month", () => {
    const monthly = summarizeMerchantByMonth(rows);
    expect(monthly).toEqual([
      {
        key: "2026-04",
        periodLabel: "2026/04",
        totalAmount: 1700
      }
    ]);
  });

  it("sorts transaction dates by actual calendar order", () => {
    const dates = [
      { date: "2026/4/11", sortableDate: "2026/04/11" },
      { date: "2026/4/1", sortableDate: "2026/04/01" },
      { date: "04/02", sortableDate: "2026/04/02" },
      { date: "2026/4/10", sortableDate: "2026/04/10" }
    ];

    expect(dates.sort(compareTransactionDateAsc)).toEqual([
      { date: "2026/4/1", sortableDate: "2026/04/01" },
      { date: "04/02", sortableDate: "2026/04/02" },
      { date: "2026/4/10", sortableDate: "2026/04/10" },
      { date: "2026/4/11", sortableDate: "2026/04/11" }
    ]);
  });
});
