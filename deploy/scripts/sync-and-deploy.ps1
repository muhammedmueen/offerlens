# OfferLens — laptop-side end-to-end redeploy. Stages + ships the build contexts from the laptop,
# then runs the server-side deploy.sh over SSH. A convenience wrapper around docs/DEPLOY_VPS.md
# §3 (scp backend/deploy), §7 (build + scp frontend dist) and §10 (redeploy) — NOT a CD system.
#
# No secrets stored here. The Google client id comes from the environment at call time
# ($env:VITE_GOOGLE_CLIENT_ID) or the -GoogleClientId param; nothing is hardcoded.
#
# Run from the repo ROOT on the laptop (PowerShell, OpenSSH on PATH, Node for a frontend build):
#   .\deploy\scripts\sync-and-deploy.ps1                 # full redeploy (backend + frontend)
#   .\deploy\scripts\sync-and-deploy.ps1 -Backend        # backend only
#   .\deploy\scripts\sync-and-deploy.ps1 -Frontend       # frontend only
#   .\deploy\scripts\sync-and-deploy.ps1 -Check          # pre-flight only on the server
#   .\deploy\scripts\sync-and-deploy.ps1 -SkipNginx      # don't reload nginx on the server
#
# Migrations are NOT handled here — they stay the documented manual SSH-tunnel step (DEPLOY_VPS §6).

[CmdletBinding()]
param(
    [string]$Server = 'deploy@72.61.245.134',
    [switch]$Frontend,
    [switch]$Backend,
    [switch]$SkipNginx,
    [switch]$Check,
    [switch]$WithMigrations,
    [string]$GoogleClientId = $env:VITE_GOOGLE_CLIENT_ID
)

$ErrorActionPreference = 'Stop'

# Default: if neither -Frontend nor -Backend was passed, do both.
if (-not $Frontend -and -not $Backend) {
    $Frontend = $true
    $Backend = $true
}

function Write-Step($msg) {
    Write-Host ""
    Write-Host "=== $msg ===" -ForegroundColor Cyan
}

# Resolve the repo root as this script's grandparent (deploy/scripts/.. -> deploy/.. -> root).
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Push-Location $RepoRoot
try {
    if ($WithMigrations) {
        Write-Step "Migrations are a SEPARATE manual step"
        Write-Host "This wrapper does not run migrations. Use the SSH-tunnel flow in"
        Write-Host "docs/DEPLOY_VPS.md section 6 (6a open port, 6b tunnel, 6c run, 6d tear down)."
        Write-Host "Continuing WITHOUT migrations..."
    }

    # ── Backend: stage without node_modules/dist via robocopy, then scp ───────
    if ($Backend) {
        Write-Step "Staging backend/ (excluding node_modules, dist) via robocopy"
        $stage = Join-Path ([System.IO.Path]::GetTempPath()) ("offerlens-backend-" + [guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $stage | Out-Null
        try {
            # robocopy exit codes 0-7 are success (8+ is a real failure). /MIR mirrors the tree.
            robocopy "backend" $stage /MIR /XD node_modules dist uploads /NFL /NDL /NJH /NJS /NP | Out-Null
            if ($LASTEXITCODE -ge 8) { throw "robocopy failed staging backend/ (exit $LASTEXITCODE)" }
            $global:LASTEXITCODE = 0

            Write-Step "Copying backend/ -> ${Server}:/srv/offerlens/backend"
            scp -r "$stage/*" "${Server}:/srv/offerlens/backend/"
            if ($LASTEXITCODE -ne 0) { throw "scp of backend/ failed (exit $LASTEXITCODE)" }
        }
        finally {
            Remove-Item -Recurse -Force $stage -ErrorAction SilentlyContinue
        }

        # Ship deploy/ too so compose/nginx/script updates (including this + deploy.sh) land.
        Write-Step "Copying deploy/ -> ${Server}:/srv/offerlens/deploy"
        scp -r "deploy" "${Server}:/srv/offerlens/"
        if ($LASTEXITCODE -ne 0) { throw "scp of deploy/ failed (exit $LASTEXITCODE)" }
    }

    # ── Frontend: build on the laptop, scp dist/* ─────────────────────────────
    if ($Frontend) {
        if (-not $GoogleClientId) {
            Write-Warning "No Google client id (set `$env:VITE_GOOGLE_CLIENT_ID or -GoogleClientId). Building with it EMPTY; the Google sign-in button will be disabled."
            $GoogleClientId = ''
        }
        Push-Location "frontend"
        try {
            if (-not (Test-Path "node_modules")) {
                Write-Step "frontend: npm ci (node_modules missing)"
                npm ci
                if ($LASTEXITCODE -ne 0) { throw "npm ci failed (exit $LASTEXITCODE)" }
            }
            Write-Step "frontend: npm run build"
            $env:VITE_API_BASE_URL = "/api/v1"
            $env:VITE_GOOGLE_CLIENT_ID = $GoogleClientId
            npm run build
            if ($LASTEXITCODE -ne 0) { throw "npm run build failed (exit $LASTEXITCODE)" }
        }
        finally {
            Pop-Location
        }

        Write-Step "Copying frontend/dist/* -> ${Server}:/var/www/offerlens/dist/"
        scp -r "frontend/dist/*" "${Server}:/var/www/offerlens/dist/"
        if ($LASTEXITCODE -ne 0) { throw "scp of frontend dist failed (exit $LASTEXITCODE)" }

        # scp'd dirs (e.g. the fresh assets/) can land as 700, so host nginx (www-data) 403s the
        # CSS/JS and the SPA serves index.html as text/css -> blank screen. Fix perms right here,
        # independent of which deploy.sh flags run (deploy.sh chmods too; belt and braces).
        Write-Step "Fixing static dir perms on the server (a+rX)"
        ssh $Server "chmod -R a+rX /var/www/offerlens/dist /var/www/offerlens/datasets"
        if ($LASTEXITCODE -ne 0) { throw "server chmod of static dirs failed (exit $LASTEXITCODE)" }
    }

    # ── Server: run deploy.sh with the matching flags ─────────────────────────
    $remoteFlags = @()
    if ($Check) { $remoteFlags += '--check' }
    if ($SkipNginx) { $remoteFlags += '--skip-nginx' }
    $flagStr = $remoteFlags -join ' '

    Write-Step "Running server deploy.sh $flagStr"
    ssh $Server "/srv/offerlens/deploy/scripts/deploy.sh $flagStr"
    if ($LASTEXITCODE -ne 0) { throw "server deploy.sh failed (exit $LASTEXITCODE)" }

    Write-Step "Done"
    Write-Host "Redeploy complete. Open https://offerlens.mueens.tech" -ForegroundColor Green
}
finally {
    Pop-Location
}
