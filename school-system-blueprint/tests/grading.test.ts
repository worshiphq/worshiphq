import { describe, expect, it } from "vitest";
import { computeTotal, gradeFor, rank, ordinal, type Band } from "../src/lib/grading";

const jhs: Band[] = [
  [1, 80, 100, "Highest"], [2, 70, 79, "Higher"], [3, 60, 69, "High"], [4, 55, 59, "High Average"],
  [5, 50, 54, "Average"], [6, 45, 49, "Low Average"], [7, 40, 44, "Low"], [8, 35, 39, "Lower"], [9, 0, 34, "Lowest"],
].map(([g, min, max, label]) => ({ grade: String(g), label: String(label), minScore: +min!, maxScore: +max!, isPass: +g! <= 6 }));

describe("computeTotal", () => {
  const comps = [
    { id: "ca", maxScore: 30, weight: 30 },
    { id: "exam", maxScore: 100, weight: 70 },
  ];
  it("weights raw scores", () => expect(computeTotal(comps, { ca: 24, exam: 60 })).toBe(66));
  it("rescales when max differs from weight", () =>
    expect(computeTotal([{ id: "t", maxScore: 20, weight: 50 }, { id: "e", maxScore: 100, weight: 50 }], { t: 15, e: 80 })).toBe(77.5));
  it("rejects out-of-range", () => expect(() => computeTotal(comps, { ca: 31 })).toThrow(RangeError));
  it("strict mode returns null when a component is missing", () =>
    expect(computeTotal(comps, { ca: 20 }, { strict: true })).toBeNull());
});

describe("gradeFor", () => {
  it("maps boundaries", () => {
    expect(gradeFor(80, jhs)?.grade).toBe("1");
    expect(gradeFor(79.4, jhs)?.grade).toBe("2"); // rounds to 79
    expect(gradeFor(79.5, jhs)?.grade).toBe("1"); // rounds to 80
    expect(gradeFor(34, jhs)?.grade).toBe("9");
  });
});

describe("rank", () => {
  it("shares positions on ties and skips", () => {
    const kids = ["a", "b", "c", "d", "e"];
    const totals: Record<string, number | null> = { a: 90, b: 85, c: 85, d: 70, e: null };
    const r = rank(kids, (k) => totals[k]!);
    expect([...kids.map((k) => r.get(k))]).toEqual([1, 2, 2, 4, null]);
  });
  it("ordinals", () => expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 103].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "103rd"]));
});
