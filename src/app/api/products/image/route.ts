import { NextResponse, type NextRequest } from "next/server";
import { getSupabase } from "@/lib/db";
import { identifyVisitor } from "@/lib/trial/visitor";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const BUCKET = "product-images";
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
export async function POST(request: NextRequest) {
  const db = getSupabase();
  if (!db) return NextResponse.json({ code: "store_unavailable" }, { status: 503 });
  let file: File | null = null;
  try {
    const form = await request.formData();
    const value = form.get("file");
    if (value instanceof File) file = value;
  } catch {
    return NextResponse.json({ code: "upload_invalid" }, { status: 400 });
  }
  if (!file || file.size === 0) return NextResponse.json({ code: "upload_invalid" }, { status: 400 });
  if (!ALLOWED.has(file.type)) return NextResponse.json({ code: "upload_type" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ code: "upload_too_large" }, { status: 400 });
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : file.type === "image/gif" ? "gif" : "jpg";
  const owner = identifyVisitor(request.headers).visitorKey.slice(0, 12);
  const key = `${owner}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error } = await db.storage.from(BUCKET).upload(key, bytes, { contentType: file.type, upsert: false });
  if (error) {
    console.error("[jutaone] product image upload failed", error.message);
    return NextResponse.json({ code: "upload_failed" }, { status: 500 });
  }
  const { data } = db.storage.from(BUCKET).getPublicUrl(key);
  return NextResponse.json({ ok: true, url: data.publicUrl }, { status: 201 });
}
