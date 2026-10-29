# SENARAI BEBAN LAPTOP UNTUK DIKOSONGKAN (mandat #1 Ayah: RAM/CPU laptop = 0 untuk projek ini)
# Diukur 2026-10-30 11:41 MYT | RAM: 8.0GB total, 3.6GB bebas (45% penuh sebelum migrasi)

## Yang BERPINDAH ke Codespaces (selepas migrasi, TUTUP di laptop)
| Beban laptop SEKARANG | Anggaran RAM | Tindakan selepas Rozie hidup di cloud |
|---|---|---|
| 20 proses chrome/Gemini/Goose/goose | ~2.1 GB | Tutup semua tetingkap Goose/Gemini ejen JutaOne di laptop; kerja ejen jalan di Codespace |
| Open Interpreter lokal | TIADA (belum pasang — BAGUS, jangan pasang) | Pasang HANYA di Codespace (`setup.sh` buat automatik). Jangan `pip install open-interpreter` di laptop |
| Ollama / model lokal | TIADA (disahkan: tiada proses, tiada service) | JANGAN pasang. Rozie cloud guna API (gpt-4o-mini dsb). Laptop kekal 0 beban LLM |
| Profil browser `chrome-profile-JutaOne/` | di `jutaone-agent/` (rujuk, jangan padam lagi) | Ganti dengan headless Chromium cloud (`headless-check.py`). Profil lokal hanya arkib |

## Yang KEKAL di laptop (ringan, perlu untuk Boss klik manual)
- Chrome biasa (1 tetingkap untuk semak + tekan LULUS manual — FB Share Dialog, TikTok upload, dsb.)
- VS Code + Goose ringan (satu sesi untuk baca laporan `shared/outbox/`, BUKAN untuk run ejen berat)
- Folder `C:\Users\lenovo\JutaOne\shared\` (mount/sync ke repo — sumber kebenaran papan + log)

## Cara sahkan kosong (PowerShell, selepas migrasi)
```powershell
Get-Process chrome, Gemini, Goose, goose -ErrorAction SilentlyContinue | Measure-Object WS -Sum
# Sasaran: < 500MB (dari 2.1GB sekarang). Ollama mesti kekal TIADA.
Get-Command ollama -ErrorAction SilentlyContinue  # mesti tiada output
pip show open-interpreter  # mesti "not found" di laptop (hanya di cloud)
```

## Nota VPS 188 (tidak disentuh mandat ini)
Enjin Hermes (`188_final_hermes.yaml`, provider toptools/DeepSeek-V4-Flash) kekal di VPS 151.185.58.188.
Rozie cloud boleh guna key SAMA via Codespaces Secrets (`TOPTOOLS_API_KEY`) — lihat `rozzie/api-server.py pilih_llm()`.
