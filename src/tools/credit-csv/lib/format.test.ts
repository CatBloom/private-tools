import { describe, expect, it } from "vitest";
import { formatDisplayDate } from "./format";

describe("formatDisplayDate", () => {
  it("formats yyyy/m/d to mm/dd", () => {
    expect(formatDisplayDate("2026/4/20")).toBe("04/20");
  });

  it("formats m/d to mm/dd", () => {
    expect(formatDisplayDate("4/2")).toBe("04/02");
  });
});
