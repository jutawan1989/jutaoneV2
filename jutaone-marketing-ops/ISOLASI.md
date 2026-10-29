# PERATURAN PENGASINGAN (ISOLATION) — dibaca oleh semua sesi terminal marketing
# Mandat Ayah 2026-10-30: operasi Rozie TIDAK BOLEH ganggu web Ali + Hermes.

# 1. DIREKTORI BERASINGAN
#    Marketing  : C:\Users\lenovo\JutaOne\jutaone-marketing-ops\   (milik Rozie + Goses)
#    Web Ali    : C:\Users\lenovo\projects\fsg-trade\  +  C:\Users\lenovo\projects\sahabat-permai\web\
#                 C:\Users\lenovo\ewallet-phase1\  (DILARANG sentuh dari sesi marketing)
#    Kongsi baca: C:\Users\lenovo\JutaOne\shared\  (board/accounts/inbox/outbox/log — BACA SAHAJA protokol papan)
#    DILARANG: tulis/edit/pip install/rm di mana-mana folder projek web dari terminal marketing.

# 2. PYTHON TERASING
#    Aktifkan dahulu SETIAP sesi marketing:
#      Windows :  jutaone-marketing-ops\venv\Scripts\Activate.ps1
#      Codespace: source jutaone-marketing-ops/venv/bin/activate
#    Semak: `where python` (Win) / `which python` (Linux) MESTI tunjuk ...\jutaone-marketing-ops\venv\...
#    Jika tunjuk venv lain / global / .venv jutaone-agent -> HENTI, aktifkan semula.

# 3. TERMINAL BEBAS
#    Sesi A "WEB-Ali-Hermes"     : terminal UTAMA — web hosting/debugging sahaja (jangan run marketing di sini)
#    Sesi B "MKTG-Rozie-Ops"     : tab BAHARU / tmux `mktg` — SEMUA eksekusi pemasaran di sini sahaja
#    tmux (Codespace):  tmux new -s mktg  |  tmux attach -t mktg  |  Ctrl-b d (lepas tanpa matikan)

# 4. PORT BEBAS (larangan Ayah: JANGAN 80, 443, 3000, 8080)
#    Ali/web guna        : 80, 443, 3000 (Next/Vite/Live Server), 8080 (ganti)
#    Marketing guna      : 8010 = ROZIE Brain API | 8011 = Open Interpreter UI | 8012 = bukti/benchmark spare
#    Di Codespaces devcontainer.json: forwardPorts [8010, 8011, 8012] SAHAJA untuk marketing.
PORT_ROZIE=8010
PORT_INTERPRETER=8011
PORT_SPARE=8012
PORT_LARANG="80 443 3000 8080"
