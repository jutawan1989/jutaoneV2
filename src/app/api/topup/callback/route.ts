import { NextResponse, type NextRequest } from "next/server";
import { logEvent } from "@/lib/analytics/events";
import { resolveVariant } from "@/lib/analytics/variant";
import { detectLocale, detectRegion } from "@/lib/geo";
import { getSupabase } from "@/lib/db";
import { verifyCallbackSignature } from "@/lib/payment/chip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChipCallback = {
  id?: string;
  reference?: string;
  status?: string;
  purchase?: { total?: number; currency?: string };
};

/**
 * Chip.Asia webhook. Signature is verified against `CHIP_PUBLIC_KEY`; callbacks
 * are rejected in production when no key is configured.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-signature");

  const check = verifyCallbackSignature(rawBody, signature);
  if (!check.ok) {
    console.warn("[jutaone] rejecting Chip callback", check.reason);
    return NextResponse.json({ ok: false, code: "invalid_signature" }, { status: 401 });
  }

  const payload = safeParse(rawBody);
  if (!payload) {
    return NextResponse.json({ ok: false, code: "invalid_body" }, { status: 400 });
  }

  const paid = payload.status === "paid";
  if (!paid) {
    return NextResponse.json({ ok: true, ignored: true, status: payload.status ?? null });
  }

  const db = getSupabase();
  if (db && payload.id) {
    const { error } = await db.from("topups").upsert(
      {
        provider: "chip",
        provider_id: payload.id,
        reference: payload.reference ?? null,
        status: payload.status,
        amount: payload.purchase?.total ?? null,
        currency: payload.purchase?.currency ?? null,
      },
      { onConflict: "provider_id" },
    );
    if (error) console.error("[jutaone] topups upsert failed", error.message);
  }

  const headers = request.headers;
  await logEvent({
    event: "topup_success",
    locale: detectLocale(headers),
    region: detectRegion(headers),
    variant: resolveVariant(payload.reference ?? "callback"),
    props: { provider: "chip", reference: payload.reference ?? null },
  });

  return NextResponse.json({ ok: true });
}

function safeParse(raw: string): ChipCallback | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as ChipCallback) : null;
  } catch {
    return null;
  }
}
