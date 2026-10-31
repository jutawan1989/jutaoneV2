import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Waitlist & Lead Ads intake (Boss spec — Xiana / Meta / Make.com).
 *
 * Two doors, one table:
 * - POST /api/waitlist: open door for the website form (Ali) and Make.com.
 *   Name + at least one contact (phone or email). Source is tracked.
 * - POST /api/lead-ads/meta: same shape plus a shared-secret gate
 *   (`LEAD_ADS_SECRET`, header `x-lead-secret` or body `secret`), so
 *   outsiders cannot inject fake leads. Meta also sends lead/form/page ids.
 *
 * Validation is deliberately strict on shape, loose on phone format —
 * Malaysian and Indonesian numbers differ, and rejecting a valid number is
 * worse than accepting an odd one (same posture as the orders route).
 */

const MAX_NAME = 120;
const MAX_EMAIL = 254;
const MAX_PHONE = 32;
const MAX_SOURCE = 64;
const MAX_META_ID = 64;

export type WaitlistInput = {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  source?: unknown;
};

export type WaitlistEntry =
  | { ok: true; name: string; email: string | null; phone: string | null; source: string }
  | { ok: false; code: "name_required" | "contact_required" | "email_invalid" | "phone_invalid" };

function cleanString(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function validEmail(email: string): boolean {
  return email.length <= MAX_EMAIL && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function validPhone(phone: string): boolean {
  return phone.length >= 6 && phone.length <= MAX_PHONE && /^[\d+\-\s()]+$/.test(phone);
}

export function normaliseWaitlistEntry(input: WaitlistInput): WaitlistEntry {
  const name = cleanString(input.name, MAX_NAME);
  if (!name) return { ok: false, code: "name_required" };

  const emailRaw = cleanString(input.email, MAX_EMAIL);
  const phoneRaw = cleanString(input.phone, MAX_PHONE);
  if (!emailRaw && !phoneRaw) return { ok: false, code: "contact_required" };
  if (emailRaw && !validEmail(emailRaw)) return { ok: false, code: "email_invalid" };
  if (phoneRaw && !validPhone(phoneRaw)) return { ok: false, code: "phone_invalid" };

  return {
    ok: true,
    name,
    email: emailRaw || null,
    phone: phoneRaw || null,
    source: cleanString(input.source, MAX_SOURCE) || "website",
  };
}

export type MetaLeadInput = WaitlistInput & {
  secret?: unknown;
  meta_lead_id?: unknown;
  meta_form_id?: unknown;
  meta_page_id?: unknown;
};

export type MetaLead =
  | {
      ok: true;
      name: string;
      email: string | null;
      phone: string | null;
      source: string;
      metaLeadId: string | null;
      metaFormId: string | null;
      metaPageId: string | null;
    }
  | { ok: false; code: "name_required" | "contact_required" | "email_invalid" | "phone_invalid" };

export function normaliseLead(input: MetaLeadInput): MetaLead {
  const base = normaliseWaitlistEntry(input);
  if (!base.ok) return base;
  const id = (value: unknown): string | null => {
    const s = cleanString(value, MAX_META_ID);
    return s || null;
  };
  return {
    ...base,
    metaLeadId: id(input.meta_lead_id),
    metaFormId: id(input.meta_form_id),
    metaPageId: id(input.meta_page_id),
  };
}

/**
 * Shared-secret gate for the Meta/Make.com door. The secret travels in the
 * `x-lead-secret` header (preferred) or the JSON body `secret` field, and is
 * compared in constant time. Fails closed: unconfigured secret refuses
 * everything, so an unset env var can never become an open door.
 */
export function verifyLeadSecret(
  headerSecret: unknown,
  bodySecret: unknown,
): { ok: true } | { ok: false; code: "forbidden" | "lead_secret_not_configured" } {
  const expected = process.env.LEAD_ADS_SECRET ?? "";
  if (!expected) return { ok: false, code: "lead_secret_not_configured" };
  const candidate = typeof headerSecret === "string" && headerSecret ? headerSecret : typeof bodySecret === "string" ? bodySecret : "";
  if (!candidate) return { ok: false, code: "forbidden" };
  const a = createHmac("sha256", "jutaone-lead-secret").update(candidate).digest();
  const b = createHmac("sha256", "jutaone-lead-secret").update(expected).digest();
  return a.length === b.length && timingSafeEqual(a, b)
    ? { ok: true }
    : { ok: false, code: "forbidden" };
}
