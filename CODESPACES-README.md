# OPERASI AWAN JutaOne — Panduan 1-Klik Buka Codespace (Projek RM50K Sehari)
**Dari:** Goses (Pakar IT & Infrastruktur) | **Untuk:** Ayah (Pengerusi) + Halwa (Strategi)
**Tarikh:** 2026-10-30

## Apa yang sudah siap (dalam folder `C:\Users\lenovo\JutaOne`)
| Fail | Tugas Mandat |
|---|---|
| `requirements-codespaces.txt` | #2 INSTALLATION — `open-interpreter + playwright + python-dotenv + requests` |
| `.devcontainer/devcontainer.json` | #1 INITIALIZATION — image Python 3.12 + Node 20 + auto `setup.sh` |
| `.devcontainer/setup.sh` | #1+#2+#4 — bina `venv`, `pip install`, `playwright install chromium`, semak LLM key |
| `benchmark-cloud.py` | #5 BENCHMARK — ping X/Telegram/OpenAI/FB + headless load + LLM round-trip, banding vs baseline lokal |
| `headless-check.py` | #3 HEADLESS — bukti Chromium `headless=True` + screenshot `proof/`, TANPA login haram |
| `.env.example` | #4 LLM API — template Secrets (jangan commit `.env` sebenar) |
| `.gitignore` | Lindungi `.env`, `venv/`, `benchmark-hasil.json` dari GitHub |

## 3 langkah Boss buka Codespace (5 minit)
1. **Push ke GitHub** (dari terminal Windows ini):
   ```powershell
   cd C:\Users\lenovo\JutaOne
   git init; git add .; git commit -m "JutaOne Cloud kit RM50K + Rozie"
   gh repo create jutaone-cloud --private --source=. --push
   # jika tiada `gh`, buat repo private di github.com > New > upload folder ini
   ```
2. **Set Secrets dulu** (Repo > Settings > Secrets > Codespaces): `OPENAI_API_KEY` (satu cukup) + `TG_BOT_TOKEN` (salin dari `JutaOne/.env` lokal).
3. **Buka Codespace:** di halaman repo > butang hijau `<> Code` > tab `Codespaces` > `Create codespace on main` (2-core disyorkan, percuma 120 jam/bulan).
4. **Dalam terminal Codespace (VS Code web), jalankan:**
   ```bash
   source venv/bin/activate
   python rozzie/api-server.py &     # OTAK ROZIE hidup (port 8000, latar)
   python rozzie/zero-latency-test.py # BUKTI sifar-latensi Rozie<->Interpreter
   python benchmark-cloud.py         # ujian kelajuan #5
   python headless-check.py          # bukti headless #3
   interpreter --model gpt-4o-mini   # Ejen Eksekusi — mesin SAMA dengan Rozie
   ```
   `setup.sh` sudah jalan automatik — `venv` + Chromium + FastAPI sudah terpasang.

## Di mana letak API key (PENTING — jangan tampal dalam chat/kod)
Repo > `Settings` > `Secrets and variables` > `Codespaces` > `New repository secret`:
- `OPENAI_API_KEY` (pilih GPT-4o-mini — terpantas/murah) ATAU `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` — **satu sahaja cukup**
- `TG_BOT_TOKEN` (salin dari `JutaOne/.env` lokal — JANGAN commit `.env` itu)
- `X_*` kemudian (rujuk `shared/content/x-api-aktivasi.md`, perlu kredit $10 + kelulusan Rozie)

## Peraturan keras (ikut REKA-BENTUK Fasa 1 ejen)
- Hanya API rasmi. `headless-check.py` TIDAK log masuk mana-mana akaun dan TIDAK pintas password — ia hanya bukti infra.
- Auto-post sebenar: Telegram via `social-tool/tg-hantar.py` (BOLEH SEKARANG). X = API berbayar, FB profil = manual Share Dialog, TikTok/IG/Threads/LinkedIn = tunggu token Boss (rujuk `shared/content/api-*.md`).
- JANGAN pasang Ollama di Codespace (RAM 2-4GB akan penuh + mesin tidur). Guna API seperti di atas.

## Bukti baseline CPU lokal (diukur 2026-10-30, mesin Lenovo Win)
- `x.com` → 200, 0.68s / 0.65s (OK)
- `facebook.com` → 200, 0.48s / 0.40s (OK)
- `api.openai.com` → 401-hidup, 0.53s / 0.47s (endpoint hidup; key lokal GAGAL 401 = key tidak sah/tamat — perlu key baharu)
- `api.telegram.org` → 200, **21.51s kemudian 41.7s** (SANGAT PERLAHAN — bukti rangkaian lokal tidak sesuai untuk auto-poster; jangkaan Codespace <1s)
- `playwright` lokal TIADA (sebab install ditetapkan di cloud) | `tg-hantar.py --selftest` LULUS exit 0
