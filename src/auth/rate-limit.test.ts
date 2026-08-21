import { describe, expect, it } from "vitest";
import { REPORT_LIMITS, SEND_LIMITS, evaluateSendRateLimit } from "./rate-limit";

describe("evaluateSendRateLimit", () => {
  it("allows a send when both counts are under the limits", () => {
    expect(
      evaluateSendRateLimit({ addressCountLastHour: 0, ipCountLastHour: 0 }),
    ).toEqual({ allowed: true });
    expect(
      evaluateSendRateLimit({ addressCountLastHour: 2, ipCountLastHour: 9 }),
    ).toEqual({ allowed: true });
  });

  it("blocks on the address limit at or above ≤3/hour", () => {
    const decision = evaluateSendRateLimit({
      addressCountLastHour: SEND_LIMITS.perAddressPerHour,
      ipCountLastHour: 0,
    });
    expect(decision).toEqual({ allowed: false, reason: "address" });
  });

  it("blocks on the IP limit at or above ≤10/hour", () => {
    const decision = evaluateSendRateLimit({
      addressCountLastHour: 0,
      ipCountLastHour: SEND_LIMITS.perIpPerHour,
    });
    expect(decision).toEqual({ allowed: false, reason: "ip" });
  });

  it("blocks on the global daily ceiling", () => {
    const decision = evaluateSendRateLimit({
      addressCountLastHour: 0,
      ipCountLastHour: 0,
      globalCountLastDay: SEND_LIMITS.globalPerDay,
    });
    expect(decision).toEqual({ allowed: false, reason: "global" });
  });

  it("treats a missing global count as zero (backwards-compatible)", () => {
    expect(
      evaluateSendRateLimit({ addressCountLastHour: 0, ipCountLastHour: 0 }),
    ).toEqual({ allowed: true });
  });

  it("reports the address reason first when both are exceeded", () => {
    const decision = evaluateSendRateLimit({
      addressCountLastHour: 99,
      ipCountLastHour: 99,
    });
    expect(decision).toEqual({ allowed: false, reason: "address" });
  });

  it("honors overridden limits", () => {
    expect(
      evaluateSendRateLimit({
        addressCountLastHour: 1,
        ipCountLastHour: 0,
        limits: { perAddressPerHour: 1, perIpPerHour: 10, globalPerDay: 90 },
      }),
    ).toEqual({ allowed: false, reason: "address" });
  });

  it("uses the spec's launch limits by default (≤3/address/hr, ≤10/IP/hr, <100/day)", () => {
    expect(SEND_LIMITS.perAddressPerHour).toBe(3);
    expect(SEND_LIMITS.perIpPerHour).toBe(10);
    expect(SEND_LIMITS.globalPerDay).toBeLessThan(100);
  });
});

describe("report throttle policy", () => {
  it("caps reports per IP per hour with no per-address cap, sharing the global ceiling", () => {
    const limits = { ...SEND_LIMITS, perIpPerHour: REPORT_LIMITS.perIpPerHour };
    expect(
      evaluateSendRateLimit({ addressCountLastHour: 0, ipCountLastHour: REPORT_LIMITS.perIpPerHour - 1, limits }),
    ).toEqual({ allowed: true });
    expect(
      evaluateSendRateLimit({ addressCountLastHour: 0, ipCountLastHour: REPORT_LIMITS.perIpPerHour, limits }),
    ).toEqual({ allowed: false, reason: "ip" });
    expect(
      evaluateSendRateLimit({ addressCountLastHour: 0, ipCountLastHour: 0, globalCountLastDay: SEND_LIMITS.globalPerDay, limits }),
    ).toEqual({ allowed: false, reason: "global" });
  });
});
