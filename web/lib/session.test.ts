import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import { issueToken, readClaims, renewToken, tokenValid } from "./session.ts";

describe("session tokens", () => {
  it("signs a device token and rejects a tampered epoch", () => {
    process.env.SESSION_SECRET = "test-secret";
    const token = issueToken(3, "iphone-1", Date.parse("2026-10-15T00:00:00.000Z"));
    const claims = readClaims(token);
    assert.equal(claims?.epoch, 3);
    assert.equal(claims?.device, "iphone-1");
    assert.equal(claims?.legacy, false);
    assert.equal(tokenValid(token, Date.parse("2026-10-16T00:00:00.000Z")), true);
    const tampered = token.replace(".3.", ".4.");
    assert.equal(tokenValid(tampered, Date.parse("2026-10-16T00:00:00.000Z")), false);
  });

  it("still accepts a legacy two-part token", () => {
    process.env.SESSION_SECRET = "test-secret";
    const exp = Math.floor(Date.parse("2026-10-15T00:00:00.000Z") / 1000) + 3600;
    const sig = createHmac("sha256", "test-secret").update(String(exp)).digest("base64url");
    const token = `${exp}.${sig}`;
    assert.equal(readClaims(token)?.legacy, true);
    assert.equal(tokenValid(token, Date.parse("2026-10-15T00:30:00.000Z")), true);
  });

  it("renews only inside the last two days", () => {
    process.env.SESSION_SECRET = "test-secret";
    const issuedAt = Date.parse("2026-10-01T00:00:00.000Z");
    const token = issueToken(1, "web", issuedAt);
    assert.equal(renewToken(token, issuedAt + 11 * 24 * 60 * 60 * 1000), null);
    assert.ok(renewToken(token, issuedAt + 13 * 24 * 60 * 60 * 1000));
  });
});
