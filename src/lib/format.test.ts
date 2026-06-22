import { describe, it, expect } from "vitest";
import { fmtClock, fmtPace, pad } from "./format";

describe("format helpers", () => {
  it("pads single digits to two places", () => {
    expect(pad(3)).toBe("03");
    expect(pad(42)).toBe("42");
  });

  it("formats clock times as H:MM:SS and rounds", () => {
    expect(fmtClock(0)).toBe("0:00:00");
    expect(fmtClock(3661)).toBe("1:01:01");
    expect(fmtClock(12345.6)).toBe("3:25:46");
  });

  it("formats paces as M:SS", () => {
    expect(fmtPace(360)).toBe("6:00");
    expect(fmtPace(395)).toBe("6:35");
  });
});
