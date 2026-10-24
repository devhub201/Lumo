import { describe, expect, it } from "vitest";
import { calculate } from "@/lib/lumo/calculator";
describe("LUMO local calculator", () => {
  it("respects precedence, grouping and unary operators", () => {
    expect(calculate("(125 + 75) / 4")).toBe(50);
    expect(calculate("2 + 3 * 4")).toBe(14);
    expect(calculate("-3 * (2 + 4)")).toBe(-18);
  });
  it("rejects code, invalid inputs and division by zero", () => {
    for (const value of ["alert(1)", "1/0", "1+", "(2+3", "1 2", ""])
      expect(() => calculate(value)).toThrow();
  });
});
