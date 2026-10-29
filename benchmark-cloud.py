#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""benchmark-cloud.py — UJIAN KELAJUAN (BENCHMARK) JutaOne Cloud
Mandat #5 Pengerusi: buktikan kelajuan awan jauh lebih pantas dari CPU lokal.

Ukur 3 perkara:
  A. Ping HTTP ke X.com, Telegram API, OpenAI API, Facebook (banding vs CPU lokal)
  B. Headless Chromium load X.com (bukti mod headless berfungsi di Codespace tanpa monitor)
  C. (Pilihan) LLM round-trip jika OPENAI_API_KEY / GEMINI_API_KEY diset

Baseline CPU lokal (Lenovo Win, 2026-10-30, urllib):
  x.com               -> 200   0.68s
  api.telegram.org    -> 200  21.51s  <-- SANGAT PERLAHAN (masalah DNS/ISP lokal)
  api.openai.com      -> 401   0.53s  (401 = endpoint hidup, tiada key)
  facebook.com        -> 200   0.48s

Jangkaan Codespace (VM Azure, rangkaian datacenter):
  Semua endpoint < 1.0s. Telegram sepatutnya jatuh dari 21.51s -> <1s.

Keluar: JSON ke stdout + benchmark-hasil.json. Kod keluar 0 = semua lulus.
Stdlib sahaja untuk Bahagian A/C. Bahagian B perlu playwright (dipasang via setup.sh).
"""
import json
import os
import sys
import time
import urllib.request
from datetime import datetime

HASIL = {"masa": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
         "persekitaran": os.environ.get("CODESPACES", "false"),
         "a_http": [], "b_headless": {}, "c_llm": {}}

BASELINE_LOKAL = {"https://x.com": 0.68, "https://api.telegram.org": 21.51,
                  "https://api.openai.com/v1/models": 0.53,
                  "https://www.facebook.com": 0.48}

URLS = list(BASELINE_LOKAL.keys())


def ping(url, timeout=20):
    t0 = time.time()
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            r.read(64)
            dt = time.time() - t0
            return {"url": url, "status": r.status, "masa_s": round(dt, 2),
                    "baseline_lokal_s": BASELINE_LOKAL[url],
                    "lebih_pantas": round(BASELINE_LOKAL[url] - dt, 2), "ok": True}
    except Exception as e:
        dt = time.time() - t0
        # 401 dari OpenAI = endpoint hidup (di CPU lokal pun 401) -> kira OK
        msg = str(e)[:160]
        ok = "401" in msg and "openai" in url
        return {"url": url, "status": "401-hidup" if ok else "GAGAL",
                "masa_s": round(dt, 2), "baseline_lokal_s": BASELINE_LOKAL[url],
                "lebih_pantas": round(BASELINE_LOKAL[url] - dt, 2),
                "ralat": msg, "ok": ok}


print("=== A. HTTP PING (banding vs CPU lokal) ===")
for u in URLS:
    h = ping(u)
    HASIL["a_http"].append(h)
    tag = "OK " if h["ok"] else "GAGAL"
    print(f"[{tag}] {h['url']} -> {h['status']} {h['masa_s']}s "
          f"(lokal {h['baseline_lokal_s']}s, beza {h['lebih_pantas']:+.2f}s)")

print("\n=== B. HEADLESS CHROMIUM (Playwright, tanpa monitor) ===")
try:
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)  # WAJIB headless di Codespace
        pg = b.new_page()
        t0 = time.time()
        pg.goto("https://x.com", wait_until="domcontentloaded", timeout=30000)
        dt = time.time() - t0
        HASIL["b_headless"] = {"ok": True, "tajuk": pg.title()[:80],
                               "masa_s": round(dt, 2), "headless": True}
        print(f"[OK] Headless Chromium load x.com: {dt:.2f}s, tajuk: {pg.title()[:80]}")
        b.close()
except Exception as e:
    HASIL["b_headless"] = {"ok": False, "ralat": str(e)[:300]}
    print(f"[GAGAL] Headless: {str(e)[:300]}")

print("\n=== C. LLM ROUND-TRIP (API pantas, bukan Ollama) ===")
if os.environ.get("OPENAI_API_KEY"):
    t0 = time.time()
    try:
        import urllib.parse
        jasad = json.dumps({"model": "gpt-4o-mini",
                            "messages": [{"role": "user", "content": "Balas: OK"}],
                            "max_tokens": 5}).encode()
        req = urllib.request.Request("https://api.openai.com/v1/chat/completions",
                                     data=jasad,
                                     headers={"Authorization": "Bearer " + os.environ["OPENAI_API_KEY"],
                                              "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=30) as r:
            d = json.loads(r.read().decode())
            dt = time.time() - t0
            HASIL["c_llm"] = {"ok": True, "model": "gpt-4o-mini",
                              "masa_s": round(dt, 2),
                              "balasan": d["choices"][0]["message"]["content"][:60]}
            print(f"[OK] gpt-4o-mini: {dt:.2f}s")
    except Exception as e:
        HASIL["c_llm"] = {"ok": False, "ralat": str(e)[:200]}
        print(f"[GAGAL] LLM: {str(e)[:200]}")
else:
    HASIL["c_llm"] = {"ok": None, "nota": "OPENAI_API_KEY tiada — set dalam Codespaces Secrets"}
    print("[LANGKAU] Tiada OPENAI_API_KEY — set dalam Codespaces Secrets dahulu.")

with open("benchmark-hasil.json", "w", encoding="utf-8") as f:
    json.dump(HASIL, f, ensure_ascii=False, indent=2)
print("\nHasil disimpan: benchmark-hasil.json")

gagal = [h for h in HASIL["a_http"] if not h["ok"]] + \
        ([1] if not HASIL["b_headless"].get("ok") else [])
sys.exit(1 if gagal else 0)
