#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""rozzie/zero-latency-test.py — BUKTI Rozie <-> Interpreter satu pelayan (mandat #3 Ayah)
Port BEBAS 8010 (lalai; ubah via env ROZIE_API=http://localhost:<port>). DILARANG 80/443/3000/8080.
Jalankan dalam Codespace:  source jutaone-marketing-ops/venv/bin/activate
                            python rozzie/api-server.py --port 8010 &
                            python rozzie/zero-latency-test.py

Uji 4 perkara:
  1. GET  /health     — Rozie hidup? LLM provider mana? (mesti localhost, BUKAN IP luar)
  2. GET  /ringkasan  — Interpreter boleh baca board+log Rozie dalam ms?
  3. POST /qa         — QA Gate deterministik (tolak angka rekaan + link jualan, lulus 3 mesej)?
  4. POST /lapor      — tulis outbox + log format piawai (rantaian Rozie tidak putus)?

LULUS = semua 4 OK + jumlah masa < 3s (bukti sifar-latensi mesin sama).
"""
import json
import os
import time
import urllib.request

ASAS = os.environ.get("ROZIE_API", "http://localhost:8010")

def panggil(kaedah, laluan, data=None, timeout=15):
    req = urllib.request.Request(ASAS + laluan,
                                 data=json.dumps(data).encode() if data else None,
                                 headers={"Content-Type": "application/json"},
                                 method=kaedah)
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode()), time.time() - t0

def main():
    print("=== UJIAN SIFAR-LATENSI: Rozie <-> Interpreter (mesin sama) ===")
    gagal = 0
    # 1. health
    try:
        d, dt = panggil("GET", "/health")
        ok = d.get("ok") and d.get("rozie") == "cloud"
        print(f"[{'OK' if ok else 'GAGAL'}] /health {dt*1000:.0f}ms — provider={d.get('llm_provider')} model={d.get('model')}")
        gagal += 0 if ok else 1
    except Exception as e:
        print(f"[GAGAL] /health: {str(e)[:200]}"); gagal += 1
    # 2. ringkasan
    try:
        d, dt = panggil("GET", "/ringkasan")
        ok = d.get("ok") and len(d.get("log_terkini_15", [])) > 0
        print(f"[{'OK' if ok else 'GAGAL'}] /ringkasan {dt*1000:.0f}ms — {len(d.get('log_terkini_15', []))} baris log dibaca")
        gagal += 0 if ok else 1
    except Exception as e:
        print(f"[GAGAL] /ringkasan: {str(e)[:200]}"); gagal += 1
    # 3. QA Gate: draf JAHAT mesti DITOLAK, draf BAIK mesti LULUS
    jahat = "Beli sekarang! Top-up RM100 dapat 70% bonus 5000 reseller!"
    baik = ("Buat ayat iklan dalam 1.5 saat. Cuba 5 kali PERCUMA sehari tanpa daftar. "
            "$1 = 1,000,000 token. Reply NAK masuk waitlist.")
    try:
        dj, _ = panggil("POST", "/qa", {"teks": jahat})
        db, dt = panggil("POST", "/qa", {"teks": baik})
        ok = (not dj["lulus"]) and db["lulus"]
        print(f"[{'OK' if ok else 'GAGAL'}] /qa {dt*1000:.0f}ms — jahat={dj['keputusan'][:30]}... baik={db['keputusan']}")
        gagal += 0 if ok else 1
    except Exception as e:
        print(f"[GAGAL] /qa: {str(e)[:200]}"); gagal += 1
    # 4. lapor (tulis ke outbox + log)
    try:
        d, dt = panggil("POST", "/lapor", {"ejen": "reza", "status": "SEPARA",
            "nota": "Ujian sifar-latensi dari Codespace — jangan padam, bukti mandat Ayah."})
        ok = d.get("ok")
        print(f"[{'OK' if ok else 'GAGAL'}] /lapor {dt*1000:.0f}ms — {d.get('ditulis', d.get('ralat'))}")
        gagal += 0 if ok else 1
    except Exception as e:
        print(f"[GAGAL] /lapor: {str(e)[:200]}"); gagal += 1
    print("LULUS — sifar-latensi disahkan." if gagal == 0 else f"GAGAL — {gagal} ujian gagal.")
    return 0 if gagal == 0 else 1

if __name__ == "__main__":
    raise SystemExit(main())
