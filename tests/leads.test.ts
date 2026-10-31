import { describe, expect, it } from "vitest";
import {
  normaliseLead,
  normaliseWaitlistEntry,
  verifyLeadSecret,
} from "@/lib/leads";

/**
 * Boss spec — Waitlist & Lead Ads API (Xiana / Meta / Make.com):
 *
 * - POST /api/waitlist: name + phone/email, source tracked, open (website form)
 * - POST /api/lead-ads/meta: same shape + shared-secret gate, rejects fakes
 */
describe("waitlist entry normalisation", () => {
  it("accepts a valid entry with phone", () => {
    const out = normaliseWaitlistEntry({ name: "Ali", phone: "+60123456789", source: "homepage" });
    expect(out).toEqual({ ok: true, name: "Ali", email: null, phone: "+60123456789", source: "homepage" });
  });

  it("accepts email when phone is absent", () => {
    const out = normaliseWaitlistEntry({ name: "Xiana", email: "xiana@example.com" });
    expect(out.ok).toBe(true);
  });

  it("rejects empty name", () => {
    expect(normaliseWaitlistEntry({ name: " ", phone: "+60123456789" }).ok).toBe(false);
  });

  it("rejects when both phone and email are missing", () => {
    const out = normaliseWaitlistEntry({ name: "Ali" });
    expect(out).toEqual({ ok: false, code: "contact_required" });
  });

  it("rejects a bad email", () => {
    expect(normaliseWaitlistEntry({ name: "Ali", email: "not-an-email" }).ok).toBe(false);
  });

  it("rejects a bad phone", () => {
    expect(normaliseWaitlistEntry({ name: "Ali", phone: "abc" }).ok).toBe(false);
  });
});

describe("lead-ads shared secret", () => {
  it("accepts the correct secret (header or body)", () => {
    process.env.LEAD_ADS_SECRET = "s3cret-shared";
    expect(verifyLeadSecret("s3cret-shared", null).ok).toBe(true);
    expect(verifyLeadSecret(null, "s3cret-shared").ok).toBe(true);
    delete process.env.LEAD_ADS_SECRET;
  });

  it("rejects a wrong secret", () => {
    process.env.LEAD_ADS_SECRET = "s3cret-shared";
    expect(verifyLeadSecret("fake", null)).toEqual({ ok: false, code: "forbidden" });
    delete process.env.LEAD_ADS_SECRET;
  });

  it("fails closed without a configured secret", () => {
    delete process.env.LEAD_ADS_SECRET;
    expect(verifyLeadSecret("anything", null).ok).toBe(false);
  });
});

describe("meta lead normalisation", () => {
  it("accepts a Meta-shaped payload", () => {
    const out = normaliseLead({
      name: "Prospek",
      phone: "+62812345678",
      source: "meta_lead_ads",
      meta_lead_id: "123",
      meta_form_id: "456",
      meta_page_id: "789",
    });
    expect(out.ok).toBe(true);
  });
});
