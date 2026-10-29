@echo off
REM MKTG-BUKA.bat — Sesi terminal BEBAS pemasaran (Windows, laptop Boss)
REM Klik 2x untuk buka terminal marketing terasing. Terminal UTAMA kekal untuk Ali+Hermes (web).
REM Mandat Ayah: venv terkunci jutaone-marketing-ops + port 8010/8011/8012 (JANGAN 80/443/3000/8080).
title MKTG-Rozie-Ops (TERASING — jangan run web Ali di sini)
cd /d %~dp0
call venv\Scripts\Activate.ps1 2>nul || call venv\Scripts\activate.bat
echo === MKTG-Rozie-Ops ===
where python
echo ROZIE_API=http://localhost:8010 (port bebas, bukan 80/443/3000/8080)
echo Perintah:  python ..\rozzie\api-server.py --port 8010
echo            python ..\rozzie\zero-latency-test.py
echo            python ..\benchmark-cloud.py
cmd /k
