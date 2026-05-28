/**
 * BytePlus host allowlist — pin the matcher contract.
 *
 * This list is read by four importers (mirror route, mirror client,
 * media proxy route, media proxy client). Any drift in matching rules
 * silently bypasses one of them, so the contract gets its own tests
 * instead of relying on each importer's site-specific suite.
 */

import { describe, expect, it } from "vitest";
import { isByteplusHost, BYTEPLUS_HOST_SUFFIXES } from "./byteplus-hosts";

describe("isByteplusHost", () => {
  it("accepts every documented BytePlus / Volcengine subdomain", () => {
    const cases = [
      "cdn.bytepluses.com",
      "ark-content-generation.bytepluses.com",
      "x.byteplusapi.com",
      "y.volccdn.com",
      "z.volcengineusercontent.com",
      "tos-ap-southeast-1.volces.com",
      "host.tos-cn-beijing.volces.com",
    ];
    for (const h of cases) expect(isByteplusHost(h)).toBe(true);
  });

  it("matches case-insensitively", () => {
    expect(isByteplusHost("CDN.BYTEPLUSES.COM")).toBe(true);
    expect(isByteplusHost("Mixed.VolccDN.com")).toBe(true);
  });

  it("rejects substring imposters", () => {
    // The leading-dot suffix prevents `fakebytepluses.com` from matching.
    const attackers = [
      "fakebytepluses.com",
      "bytepluses.com.evil.example",
      "notabytepluses.com",
      "example.com",
      "r2.cloudflarestorage.com",
    ];
    for (const h of attackers) expect(isByteplusHost(h)).toBe(false);
  });

  it("exports a non-empty suffix list", () => {
    expect(BYTEPLUS_HOST_SUFFIXES.length).toBeGreaterThan(0);
    for (const s of BYTEPLUS_HOST_SUFFIXES) {
      expect(s.startsWith(".")).toBe(true);
    }
  });
});
