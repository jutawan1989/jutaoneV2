#!/bin/bash
# .devcontainer/setup.sh — JutaOne Cloud: ROZIE + Open Interpreter, satu pelayan
# Mandat tambahan Ayah: (1) kosongkan laptop (2) LLM API pantas (3) Rozie<->Interpreter sifar-latensi
set -e
echo "=== [1/6] INITIALIZATION: venv ==="
python3 --version
python3 -m venv venv
source venv/bin/activate
python -m pip install --upgrade pip

echo "=== [2/6] INSTALLATION: Interpreter + Playwright + ROZIE Brain deps ==="
pip install -r requirements-codespaces.txt
python -m playwright install --with-deps chromium || python -m playwright install chromium

echo "=== [3/6] HEADLESS CHECK ==="
python -c "from playwright.sync_api import sync_playwright; print('playwright import OK')"

echo "=== [4/6] LLM API CHECK (tiada Ollama — RAM cloud 2-4GB) ==="
if [ -z "$OPENAI_API_KEY" ] && [ -z "$GEMINI_API_KEY" ] && [ -z "$ANTHROPIC_API_KEY" ] \
   && [ -z "$DEEPSEEK_API_KEY" ] && [ -z "$GROQ_API_KEY" ] && [ -z "$TOPTOOLS_API_KEY" ]; then
  echo "AMARAN: Tiada LLM key dalam Codespaces Secrets."
  echo "-> Settings > Secrets > Codespaces > New repository secret (satu cukup: OPENAI_API_KEY)"
else
  echo "LLM API key dikesan (nilai tidak dipapar)."
fi

echo "=== [5/6] ROZIE BRAIN: semak fail otak ==="
ls -la rozzie/ 2>/dev/null || ls -la rozie/ 2>/dev/null || echo "(folder rozzie/ akan dibina langkah seterusnya)"
test -f rozzie/rozie-system.md && echo "rozie-system.md OK" || echo "(!) rozie-system.md tiada lagi"
test -f rozzie/api-server.py && echo "api-server.py OK" || echo "(!) api-server.py tiada lagi"

echo "=== [6/6] SIAP ==="
echo "Hidupkan otak Rozie :  source venv/bin/activate && python rozzie/api-server.py  (port 8000)"
echo "Ujian kelajuan      :  python benchmark-cloud.py"
echo "Bukti headless      :  python headless-check.py"
echo "Ejen eksekusi       :  interpreter --model gpt-4o-mini"
echo "Sifar-latensi       :  Rozie (localhost:8000) <-> Interpreter (mesin sama, tiada rangkaian luar)"
