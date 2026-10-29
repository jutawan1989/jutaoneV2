#!/usr/bin/env powershell
# PUSH-KE-GITHUB.ps1 — Migrasi jutaone-marketing-ops + rozzie ke repo jutaoneV2 (mandat Ayah 2026-10-30)
# Guna: klik kanan > Run with PowerShell, TAMPAL URL repo bila ditanya.
# Skrip ini: init git (jika tiada) -> tambah fail kod SAHAJA (aset MP4/JPG besar + .env + venv DIKECUALIKAN)
#            -> commit -> push ke main. Kredensial diambil dari Windows Credential Manager automatik.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$repo = Read-Host "Tampal URL repo jutaoneV2 (cth https://github.com/OWNER/jutaoneV2.git)"
if (-not $repo) { Write-Host "BATAL: URL kosong."; exit 1 }

if (-not (Test-Path ".git")) { git init; git branch -M main }
$ada = git remote 2>$null
if ($ada -notmatch "origin") { git remote add origin $repo } else { git remote set-url origin $repo }

# Pastikan pengecualian (aset besar + rahsia + venv tidak masuk repo)
$gi = ".gitignore"
$wajib = @(".env", "venv/", "__pycache__/", "*.pyc", "benchmark-hasil.json",
  "chrome-profile-JutaOne/", "logs/", "proof/",
  "shared/assets/", "*.mp4", "*.mp3", "*.wav", "*.mov")
foreach ($w in $wajib) {
  if (-not (Select-String -Path $gi -Pattern ([regex]::Escape($w)) -Quiet -ErrorAction SilentlyContinue)) {
    Add-Content $gi $w
  }
}

git add jutaone-marketing-ops/ISOLASI.md jutaone-marketing-ops/requirements.txt `
  jutaone-marketing-ops/MKTG-BUKA.bat jutaone-marketing-ops/mktg-buka.sh `
  rozzie/ .devcontainer/ benchmark-cloud.py headless-check.py `
  requirements-codespaces.txt CODESPACES-README.md .env.example .gitignore `
  PUSH-KE-GITHUB.ps1 2>$null
git add shared/board.md shared/accounts.md shared/log.md 2>$null
git status --short | Select-Object -First 30
git commit -m "Mandat Ayah 2026-10-30: isolasi marketing (jutaone-marketing-ops venv + port 8010/8011/8012) + otak Rozie (api-server, zero-latency-test)" 2>$null
if ($LASTEXITCODE -ne 0) { Write-Host "(tiada perubahan baharu untuk commit — teruskan push)" }
git push -u origin main
Write-Host "`nSIAP — semak di GitHub, kemudian buka Codespace dan jalankan ujian zero-latency."
