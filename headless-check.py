#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""headless-check.py — BUKTI mod headless berfungsi di Codespace (tanpa monitor).
Mandat #3: pastikan Playwright dikonfigurasi headless untuk kerja log masuk/auto-post di belakang tabir.

Skrip ini TIDAK memasukkan password ke mana-mana akaun dan TIDAK memintas login.
Ia hanya:
  1. Lancar Chromium headless=True
  2. Muat halaman login X + Facebook (ukur masa)
  3. Simpan screenshot bukti ke proof/
  4. Lapor butiran untuk benchmark

Sebab sekatan platform (kajian Fasa 1 ejen):
  - FB profil personal TIDAK BOLEH auto-post via API (Sara: api-facebook.md) -> jalan sah = Share Dialog manual.
  - X auto-post = API berbayar pay-per-use sahaja (Reza: api-x.md + x-api-aktivasi.md), BUKAN scraping login.
Jadi skrip headless di sini = bukti infra + pra-syarat teknikal, BUKAN jalan pintas akaun Boss.
Auto-post sebenar ikut API rasmi (tg-hantar.py untuk Telegram; X/FB tunggu kelulusan/token Boss).
"""
import time
from datetime import datetime
from pathlib import Path

SASARAN = ["https://x.com/login", "https://www.facebook.com/login.php", "https://t.me/JutaOneAi"]

def main():
    from playwright.sync_api import sync_playwright
    proof = Path("proof"); proof.mkdir(exist_ok=True)
    hasil = {"masa": datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "headless": True, "halaman": []}
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)  # WAJIB True di Codespace
        pg = b.new_page()
        for url in SASARAN:
            t0 = time.time()
            try:
                pg.goto(url, wait_until="domcontentloaded", timeout=30000)
                dt = time.time() - t0
                nama = "proof/headless-" + url.split("//")[1].split("/")[0].replace(".", "_") + ".png"
                pg.screenshot(path=nama)
                print(f"[OK] {url} {dt:.2f}s -> {nama} | tajuk: {pg.title()[:70]}")
                hasil["halaman"].append({"url": url, "ok": True, "masa_s": round(dt, 2), "shot": nama})
            except Exception as e:
                print(f"[GAGAL] {url}: {str(e)[:180]}")
                hasil["halaman"].append({"url": url, "ok": False, "ralat": str(e)[:180]})
        b.close()
    import json
    (proof / "headless-hasil.json").write_text(json.dumps(hasil, ensure_ascii=False, indent=2), encoding="utf-8")
    print("Siap. Lihat folder proof/")
    return 0 if all(h["ok"] for h in hasil["halaman"]) else 1

if __name__ == "__main__":
    raise SystemExit(main())
