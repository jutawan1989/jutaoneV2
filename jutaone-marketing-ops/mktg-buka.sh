#!/bin/bash
# mktg-buka.sh — Sesi terminal BEBAS pemasaran (Codespaces/Linux) + tmux `mktg`
# Guna:  bash jutaone-marketing-ops/mktg-buka.sh   (atau: tmux new -s mktg)
# Terminal UTAMA kekal untuk Ali+Hermes (web). Semua marketing dalam sesi ini sahaja.
set -e
cd "$(dirname "$0")"
if [ -f venv/bin/activate ]; then source venv/bin/activate; fi
echo "=== MKTG-Rozie-Ops (terasing) ==="
which python
echo "ROZIE_API=http://localhost:8010 (port bebas, bukan 80/443/3000/8080)"
echo "Perintah:  python ../rozzie/api-server.py --port 8010"
echo "           python ../rozzie/zero-latency-test.py --port 8010"
if command -v tmux >/dev/null 2>&1; then
  if [ -z "$TMUX" ]; then
    echo "Masuk tmux sesi 'mktg' (Ctrl-b d untuk lepas tanpa matikan)..."
    exec tmux new -A -s mktg
  else
    echo "Sudah dalam tmux: $TMUX"
  fi
else
  echo "(tmux tiada — teruskan dalam tab terminal baharu ini)"
  exec bash
fi
