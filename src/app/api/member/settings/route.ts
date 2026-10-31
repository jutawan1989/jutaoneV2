import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getSupabase } from "@/lib/db";
import {
  SESSION_COOKIE,
  hashPassword,
  verifyPassword,
  verifySession,
} from "@/lib/auth/member";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SettingsBody = {
  displayName?: unknown;
  currentPassword?: unknown;
  newPassword?: unknown;
  confirmPassword?: unknown;
  bankName?: unknown;
  accountNo?: unknown;
  accountHolder?: unknown;
};

function str(value: unknown, max = 120): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/**
 * GET: profile + saved bank details for the settings form.
 * Bank columns may not exist yet (migration not run) — fall back gracefully.
 */
export async function GET() {
  const jar = await cookies();
  const ownerRef = verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!ownerRef) return NextResponse.json({ code: "unauthorised" }, { status: 401 });

  const db = getSupabase();
  if (!db) return NextResponse.json({ code: "store_unavailable" }, { status: 503 });

  const full = await db
    .from("members")
    .select("email, display_name, bank_name, account_no, account_holder")
    .eq("owner_ref", ownerRef)
    .maybeSingle();

  if (!full.error && full.data) {
    return NextResponse.json({
      ok: true,
      email: full.data.email as string,
      displayName: (full.data.display_name as string | null) ?? null,
      bankName: ((full.data as Record<string, unknown>).bank_name as string | null) ?? "",
      accountNo: ((full.data as Record<string, unknown>).account_no as string | null) ?? "",
      accountHolder:
        ((full.data as Record<string, unknown>).account_holder as string | null) ?? "",
    });
  }

  // Fallback when bank columns do not exist yet.
  const basic = await db
    .from("members")
    .select("email, display_name")
    .eq("owner_ref", ownerRef)
    .maybeSingle();
  if (basic.error || !basic.data) {
    return NextResponse.json({ code: "not_found" }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    email: basic.data.email as string,
    displayName: (basic.data.display_name as string | null) ?? null,
    bankName: "",
    accountNo: "",
    accountHolder: "",
  });
}

/**
 * PATCH: save profile + password + bank details in one "Simpan Perubahan".
 * - displayName: optional, max 80 chars.
 * - password change: requires currentPassword match; new >= 8 chars; confirm must match.
 * - bank fields: optional, saved when the migration columns exist.
 */
export async function PATCH(request: NextRequest) {
  const jar = await cookies();
  const ownerRef = verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!ownerRef) return NextResponse.json({ code: "unauthorised" }, { status: 401 });

  const db = getSupabase();
  if (!db) return NextResponse.json({ code: "store_unavailable" }, { status: 503 });

  const body = (await request.json().catch(() => null)) as SettingsBody | null;
  if (!body) return NextResponse.json({ code: "bad_request" }, { status: 400 });

  const displayName = str(body.displayName, 80);
  const bankName = str(body.bankName, 80);
  const accountNo = str(body.accountNo, 40).replace(/\s+/g, "");
  const accountHolder = str(body.accountHolder, 80);
  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  const confirmPassword =
    typeof body.confirmPassword === "string" ? body.confirmPassword : "";

  const wantsPasswordChange = currentPassword !== "" || newPassword !== "" || confirmPassword !== "";
  if (wantsPasswordChange) {
    if (!currentPassword || !newPassword || !confirmPassword) {
      return NextResponse.json({ code: "password_incomplete" }, { status: 400 });
    }
    if (newPassword.length < 8) {
      return NextResponse.json(
        { code: "password_too_short", min: 8 },
        { status: 400 },
      );
    }
    if (newPassword !== confirmPassword) {
      return NextResponse.json({ code: "password_mismatch" }, { status: 400 });
    }
    const { data, error } = await db
      .from("members")
      .select("password_hash")
      .eq("owner_ref", ownerRef)
      .maybeSingle();
    if (error || !data) return NextResponse.json({ code: "not_found" }, { status: 404 });
    if (!verifyPassword(currentPassword, data.password_hash as string)) {
      return NextResponse.json({ code: "current_password_wrong" }, { status: 401 });
    }
  }

  const update: Record<string, string | null> = {};
  if (body.displayName !== undefined) update.display_name = displayName || null;
  if (wantsPasswordChange) update.password_hash = hashPassword(newPassword);
  // Bank columns: included when present; ignored silently when migration not run.
  if (body.bankName !== undefined) update.bank_name = bankName || null;
  if (body.accountNo !== undefined) update.account_no = accountNo || null;
  if (body.accountHolder !== undefined) update.account_holder = accountHolder || null;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true, noop: true });
  }

  const { error } = await db.from("members").update(update).eq("owner_ref", ownerRef);
  if (error) {
    // Missing bank columns on an un-migrated DB: retry without them so
    // profile/password saves still succeed.
    const missingColumn = /bank_name|account_no|account_holder|column/i.test(error.message);
    if (missingColumn) {
      delete update.bank_name;
      delete update.account_no;
      delete update.account_holder;
      if (Object.keys(update).length === 0) {
        return NextResponse.json({ ok: true, bank_unsaved: true });
      }
      const retry = await db.from("members").update(update).eq("owner_ref", ownerRef);
      if (retry.error) {
        return NextResponse.json({ code: "save_failed" }, { status: 500 });
      }
      return NextResponse.json({ ok: true, bank_unsaved: true });
    }
    return NextResponse.json({ code: "save_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
