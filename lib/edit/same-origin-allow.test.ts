/**
 * What may be stored as a reference URL — and, because every reference URL is
 * rendered as a link, what may end up in an href.
 */

import { describe, expect, it } from "vitest";
import { isAllowedRefUrl } from "./same-origin";

describe("isAllowedRefUrl", () => {
  it("allows the two forms the app actually produces", () => {
    expect(isAllowedRefUrl("/library-cache/upload-1.png")).toBe(true);
    expect(isAllowedRefUrl("https://cdn.byteplus.test/a.png?sig=1")).toBe(true);
    expect(isAllowedRefUrl("http://localhost:3000/x.png")).toBe(true);
  });

  it("refuses javascript:, which would be script in an href", () => {
    for (const bad of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "  javascript:alert(1)  ",
      "jAvAsCrIpT:void(0)",
    ]) {
      expect(isAllowedRefUrl(bad)).toBe(false);
    }
  });

  it("refuses protocol-relative, which only LOOKS same-origin", () => {
    // The trap: a "starts with /" check calls this ours. The browser calls it
    // evil.example.
    expect(isAllowedRefUrl("//evil.example/x.png")).toBe(false);
  });

  it("refuses data:, blob: and file:", () => {
    // data: is refused for the quota invariant as much as for safety — the
    // store holds URLs, never bytes.
    expect(isAllowedRefUrl("data:image/png;base64,AAAA")).toBe(false);
    expect(isAllowedRefUrl("blob:http://localhost/abc")).toBe(false);
    expect(isAllowedRefUrl("file:///etc/passwd")).toBe(false);
  });

  it("refuses empty and non-URL junk", () => {
    expect(isAllowedRefUrl("")).toBe(false);
    expect(isAllowedRefUrl("   ")).toBe(false);
    expect(isAllowedRefUrl("not a url")).toBe(false);
    expect(isAllowedRefUrl("x.png")).toBe(false);
  });
});
