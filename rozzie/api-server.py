#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""rozzie/api-server.py — OTAK ROZIE di awan (sifar-latensi dengan Open Interpreter)
Mandat Ayah: (1) kosongkan laptop (2) LLM API pantas (3) Rozie<->Interpreter satu pelayan, tukar skrip serta-merta.
Mandat pengasingan: port BEBAS 8010 (lalai, boleh --port); DILARANG 80/443/3000/8080 (milik web Ali).

Reka bentuk:
  - FastAPI di http://localhost:8010 (dalam Codespace yang SAMA dengan `interpreter`).
  - Interpreter panggil Rozie via http://localhost:8010 — tiada rangkaian luar, tiada sela masa.
  - LLM: API berkelajuan tinggi (OpenAI gpt-4o-mini lalai; ikut env OPENAI_API_KEY / GEMINI_API_KEY /
    ANTHROPIC_API_KEY / DEEPSEEK_API_KEY / GROQ_API_KEY / TOPTOOLS_API_KEY). TIADA Ollama (RAM cloud kecil).
  - Otak baca: rozzie/rozie-system.md + shared/board.md + shared/accounts.md + shared/log.md (konteks CMO hidup).
  - Endpoint:
      GET  /health                    -> status + model + masa
      POST /arahan  {teks, ejen?}     -> Rozie fikir (LLM) + tulis ke shared/inbox/<ejen>.md, pulang draf arahan
      POST /qa      {fail_draf}       -> QA Gate: SEMAK draf vs 3 mesej jenama + gate merah + angka rekaan
      POST /lapor   {ejen, status, nota} -> append ke shared/outbox/<ejen>.md + log.md (format piawai)
      GET  /ringkasan                 -> status 7 ejen dari board.md + log terkini (untuk Interpreter baca segera)

Jalankan di Codespace:  source jutaone-marketing-ops/venv/bin/activate && python rozzie/api-server.py --port 8010
Uji sifar-latensi:       ROZIE_API=http://localhost:8010 python rozzie/zero-latency-test.py
"""
import json
import os
import re
import urllib.request
from datetime import datetime
from pathlib import Path

AKAR = Path(__file__).resolve().parent.parent  # JutaOne/
SHARED = AKAR / "shared"
SISTEM = Path(__file__).resolve().with_name("rozie-system.md")

def masa():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

def baca_relatif(nama, had=6000):
    p = SHARED / nama
    if not p.exists():
        return f"({nama} tiada)"
    t = p.read_text(encoding="utf-8", errors="replace")
    return t[:had]

KONTEKS_STATIK = ""
if SISTEM.exists():
    KONTEKS_STATIK = SISTEM.read_text(encoding="utf-8")

# --- LLM via API (ikut mana-mana key yang diset; lalai gpt-4o-mini) ---
def pilih_llm():
    if os.environ.get("OPENAI_API_KEY"):
        return ("openai", "https://api.openai.com/v1/chat/completions",
                "Bearer " + os.environ["OPENAI_API_KEY"], "gpt-4o-mini")
    if os.environ.get("GEMINI_API_KEY"):
        return ("gemini", None, os.environ["GEMINI_API_KEY"], "gemini-2.0-flash")
    if os.environ.get("DEEPSEEK_API_KEY"):
        return ("deepseek", "https://api.deepseek.com/v1/chat/completions",
                "Bearer " + os.environ["DEEPSEEK_API_KEY"], "deepseek-chat")
    if os.environ.get("GROQ_API_KEY"):
        return ("groq", "https://api.groq.com/openai/v1/chat/completions",
                "Bearer " + os.environ["GROQ_API_KEY"], "llama-3.3-70b-versatile")
    if os.environ.get("TOPTOOLS_API_KEY"):  # sama provider dengan VPS 188 Hermes
        return ("toptools", "https://top-tools-ai.com/api/v1/chat/completions",
                "Bearer " + os.environ["TOPTOOLS_API_KEY"], "DeepSeek-V4-Flash")
    if os.environ.get("ANTHROPIC_API_KEY"):
        return ("anthropic", "https://api.anthropic.com/v1/messages",
                "anthropic", "claude-haiku-4-5")
    return (None, None, None, None)

def fikir_llm(sistem, pengguna, max_tokens=800, timeout=60):
    prov, url, key, model = pilih_llm()
    if not prov:
        raise RuntimeError("Tiada LLM API key dalam env (OPENAI/GEMINI/DEEPSEEK/GROQ/TOPTOOLS/ANTHROPIC).")
    if prov == "gemini":
        ep = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
        jasad = {"system_instruction": {"parts": [{"text": sistem}]},
                 "contents": [{"parts": [{"text": pengguna}]}],
                 "generationConfig": {"maxOutputTokens": max_tokens}}
        req = urllib.request.Request(ep, data=json.dumps(jasad).encode(),
                                     headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            d = json.loads(r.read().decode())
        return d["candidates"][0]["content"]["parts"][0]["text"]
    if prov == "anthropic":
        jasad = {"model": model, "max_tokens": max_tokens,
                 "system": sistem, "messages": [{"role": "user", "content": pengguna}]}
        req = urllib.request.Request(url, data=json.dumps(jasad).encode(),
                                     headers={"x-api-key": os.environ["ANTHROPIC_API_KEY"],
                                              "anthropic-version": "2023-06-01",
                                              "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            d = json.loads(r.read().decode())
        return d["content"][0]["text"]
    jasad = {"model": model, "messages": [{"role": "system", "content": sistem},
                                          {"role": "user", "content": pengguna}],
             "max_tokens": max_tokens, "temperature": 0.4}
    req = urllib.request.Request(url, data=json.dumps(jasad).encode(),
                                 headers={"Authorization": key, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        d = json.loads(r.read().decode())
    return d["choices"][0]["message"]["content"]

# --- QA Gate (peraturan statik, tanpa LLM — pantas, deterministik) ---
M1 = ["1.5 saat", "1.5s", "1,5 saat"]
M2 = ["5 kali", "5x", "percuma", "PERCUMA"]
M3 = ["1,000,000", "1juta", "1 juta", "$1"]
MERAH = re.compile(r"(top[\s-]?up|beli sekarang|checkout|bayar|harga promo|diskaun.*beli|link.*bayar)", re.I)
ANGKA_BAHAYA = re.compile(r"(\d+\s*(juta|ribu|k\b|%|x ganda|reseller|jerung))", re.I)

def qa_gate(teks):
    m1 = any(k.lower() in teks.lower() for k in M1)
    m2 = any(k.lower() in teks.lower() for k in M2)
    m3 = any(k.lower() in teks.lower() for k in M3)
    merah = bool(MERAH.search(teks))
    angka = ANGKA_BAHAYA.findall(teks)
    lulus = m1 and m2 and m3 and not merah
    return {"lulus": lulus, "mesej_jenama": {"m1_1_5s": m1, "m2_percuma": m2, "m3_1usd": m3},
            "gate_merah_dilanggar": merah,
            "angka_mencurigakan": [a[0] for a in angka[:8]],
            "keputusan": "LULUS" if lulus else "TOLAK — betulkan sebelum sampai ke Boss"}

# --- Aplikasi FastAPI ---
try:
    from fastapi import FastAPI
    from fastapi.responses import JSONResponse
    from pydantic import BaseModel
    ADA_FASTAPI = True
except ImportError:
    ADA_FASTAPI = False

if ADA_FASTAPI:
    app = FastAPI(title="ROZIE Brain — JutaOne Cloud")

    class Arahan(BaseModel):
        teks: str
        ejen: str = "semua"

    class QASemak(BaseModel):
        fail_draf: str = ""
        teks: str = ""

    class Laporan(BaseModel):
        ejen: str
        status: str  # SIAP | SEPARA | TERHALANG
        nota: str

    @app.get("/health")
    def health():
        prov, _, _, model = pilih_llm()
        return {"ok": True, "rozie": "cloud", "masa": masa(),
                "llm_provider": prov or "TIADA-KEY", "model": model or "-",
                "latensi_ke_interpreter": "localhost (sifar-latensi, mesin sama)"}

    @app.post("/arahan")
    def buat_arahan(a: Arahan):
        sistem = KONTEKS_STATIK + "\n\n--- BOARD ---\n" + baca_relatif("board.md") \
            + "\n\n--- AKAUN ---\n" + baca_relatif("accounts.md", 3000)
        try:
            draf = fikir_llm(sistem, f"Arahan Boss: {a.teks}\nSasaran ejen: {a.ejen}\n"
                             "Tulis draf arahan ringkas (maks 200 patah) + 3 mesej jenama + CTA waitlist. "
                             "Jika maklumat tak cukup, tulis TERHALANG dan nyatakan apa Boss kena beri.")
        except Exception as e:
            draf = f"TERHALANG — LLM tidak dapat dihubungi: {str(e)[:200]}"
        if a.ejen != "semua":
            inbox = SHARED / "inbox" / f"{a.ejen}.md"
            if inbox.parent.exists():
                with inbox.open("a", encoding="utf-8") as f:
                    f.write(f"\n\n## [{masa()}] ARAHAN ROZIE (awan)\n{draf}\n")
        return {"ok": True, "ejen": a.ejen, "draf": draf}

    @app.post("/qa")
    def semak_qa(q: QASemak):
        teks = q.teks or ""
        if q.fail_draf:
            p = AKAR / q.fail_draf
            if p.exists():
                teks = p.read_text(encoding="utf-8", errors="replace")
            else:
                return {"ok": False, "ralat": f"fail {q.fail_draf} tiada"}
        return {"ok": True, **qa_gate(teks)}

    @app.post("/lapor")
    def catat_laporan(l: Laporan):
        if l.status not in ("SIAP", "SEPARA", "TERHALANG"):
            return {"ok": False, "ralat": "status mesti SIAP/SEPARA/TERHALANG"}
        out = SHARED / "outbox" / f"{l.ejen}.md"
        baris = f"\n\n## [{masa()}] {l.ejen} | {l.status}\n{l.nota}\n"
        if out.parent.exists():
            with out.open("a", encoding="utf-8") as f:
                f.write(baris)
            with (SHARED / "log.md").open("a", encoding="utf-8") as f:
                f.write(f"{masa()} | {l.ejen} | {l.nota[:90]} | {l.status.lower()}\n")
            return {"ok": True, "ditulis": str(out)}
        return {"ok": False, "ralat": "folder shared/outbox tiada (mount repo penuh?)"}

    @app.get("/ringkasan")
    def ringkasan():
        log = SHARED / "log.md"
        baris = []
        if log.exists():
            raw = log.read_text(encoding="utf-8", errors="replace").strip().split("\n")
            baris = raw[-15:]
        return {"ok": True, "masa": masa(), "board": baca_relatif("board.md", 2500),
                "log_terkini_15": baris}

    def main(port=None):
        import argparse
        ap = argparse.ArgumentParser(description="Otak ROZIE di awan (port bebas, bukan 80/443/3000/8080)")
        ap.add_argument("--port", type=int, default=int(os.environ.get("PORT_ROZIE", "8010")))
        args = ap.parse_args()
        p = port if port is not None else args.port
        import uvicorn
        print(f"ROZIE Brain hidup di http://localhost:{p} (sifar-latensi dengan Interpreter)")
        uvicorn.run(app, host="127.0.0.1", port=p)

    if __name__ == "__main__":
        main()
else:
    print("fastapi tiada — pasang: pip install fastapi 'uvicorn[standard]'")
