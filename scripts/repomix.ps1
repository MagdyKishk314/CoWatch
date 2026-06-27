#!/usr/bin/env pwsh
#Requires -Version 5.1
<#
.SYNOPSIS
    Generate all Cowatch Repomix bundles into the repomix/ folder.

.DESCRIPTION
    Packs the monorepo into the seven canonical XML bundles defined in
    repomix/manifest.md, using `npx repomix` once per bundle with the
    appropriate source scope and --output flag.

    Bundles produced (into <repoRoot>/repomix/):
      full-project.xml  -> whole repo            (scope: repo root)
      backend.xml       -> NestJS server         (scope: apps/server)
      frontend.xml      -> React web app         (scope: apps/web)
      electron.xml      -> Electron desktop shell (scope: apps/desktop)
      realtime.xml      -> realtime abstraction   (scope: packages/realtime)
      social.xml        -> social shared logic    (scope: packages/social)
      deployment.xml    -> docker + scripts infra (scope: docker, scripts)

    Process rules R2/R3/R4 (see context/architecture.md Section 10): every
    architectural change must regenerate the affected bundle(s). This script
    is the canonical generator. Bundles are git-ignored build outputs.

    PLANNING-PHASE SAFETY: each bundle is skipped (with a warning) if its
    source root does not yet exist. During Phase 0 most roots are absent, so
    running this now is a no-op for those bundles -- the apps do not exist yet.
    DO NOT rely on output until code exists (Phase 1+).

.PARAMETER Only
    Optional comma-separated list of bundle keys to (re)generate instead of all.
    Keys: full,backend,frontend,electron,realtime,social,deployment

.EXAMPLE
    pwsh scripts/repomix.ps1
    # Regenerate every bundle whose source exists.

.EXAMPLE
    pwsh scripts/repomix.ps1 -Only realtime,backend
    # Regenerate just the realtime and backend bundles (e.g. after an ADR-004 change).

.NOTES
    Cross-platform: works on Windows PowerShell 5.1 and PowerShell 7+ (pwsh).
    Pin a Repomix version for reproducibility with: $env:REPOMIX_VERSION = '0.2.0'
#>
[CmdletBinding()]
param(
    [string]$Only = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# --- Resolve repo root (script lives in <root>/scripts) and cd to it ---
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot  = Resolve-Path (Join-Path $ScriptDir '..')
Set-Location $RepoRoot

$OutDir = Join-Path $RepoRoot 'repomix'
if (-not (Test-Path $OutDir)) {
    New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
}

# --- Locate the repomix runner (npx, optionally version-pinned) ---
$Npx = (Get-Command npx -ErrorAction SilentlyContinue)
if ($null -eq $Npx) {
    Write-Error "npx not found on PATH. Install Node.js (https://nodejs.org) and re-run."
    exit 1
}
$RepomixVersion = $env:REPOMIX_VERSION
if ([string]::IsNullOrWhiteSpace($RepomixVersion)) {
    $RepomixPkg = 'repomix'
} else {
    $RepomixPkg = "repomix@$RepomixVersion"
}

# --- Shared ignore patterns (in addition to .gitignore, which repomix honors) ---
# NEVER pack: prior bundles, secrets, build outputs, deps, generated client.
$IgnoreGlobs = @(
    'repomix/**'
    '**/node_modules/**'
    '**/dist/**'
    '**/.turbo/**'
    '**/.next/**'
    '**/out/**'
    '**/release/**'
    '**/coverage/**'
    '**/*.env'
    '**/.env*'
    '**/*.pem'
    '**/*.key'
    '**/generated/**'
    '**/prisma/generated/**'
    '**/*.log'
) -join ','

# --- Bundle definitions: key => @{ Scope=<relative paths[]>; Out=<file> } ---
# Scope is one or more relative roots passed positionally to repomix.
$Bundles = [ordered]@{
    'full'       = @{ Scope = @('.');                Out = 'full-project.xml' }
    'backend'    = @{ Scope = @('apps/server');      Out = 'backend.xml'      }
    'frontend'   = @{ Scope = @('apps/web');         Out = 'frontend.xml'     }
    'electron'   = @{ Scope = @('apps/desktop');     Out = 'electron.xml'     }
    'realtime'   = @{ Scope = @('packages/realtime');Out = 'realtime.xml'     }
    'social'     = @{ Scope = @('packages/social');  Out = 'social.xml'       }
    'deployment' = @{ Scope = @('docker','scripts'); Out = 'deployment.xml'   }
}

# --- Selection filter ---
$Selected = @()
if (-not [string]::IsNullOrWhiteSpace($Only)) {
    $Selected = $Only.Split(',') | ForEach-Object { $_.Trim().ToLower() } | Where-Object { $_ }
    foreach ($k in $Selected) {
        if (-not $Bundles.Contains($k)) {
            Write-Error "Unknown bundle key '$k'. Valid keys: $($Bundles.Keys -join ', ')"
            exit 1
        }
    }
}

function Invoke-RepomixBundle {
    param(
        [string]   $Key,
        [string[]] $Scope,
        [string]   $OutFile
    )

    # Planning-phase guard: skip if NONE of the scope roots exist yet.
    $existing = @($Scope | Where-Object { Test-Path (Join-Path $RepoRoot $_) })
    if ($existing.Count -eq 0) {
        Write-Warning ("SKIP [{0}] -> {1}: source root(s) '{2}' do not exist yet (expected during Phase 0; code not scaffolded)." -f $Key, $OutFile, ($Scope -join ', '))
        return $false
    }

    $outPath = Join-Path $OutDir $OutFile

    # Positional args: the scope root(s). Multi-root uses --include glob form.
    $args = @()
    if ($existing.Count -eq 1) {
        $args += $existing[0]
    } else {
        # Multiple roots: pack from repo root and restrict via --include.
        $args += '.'
        $includeGlobs = ($existing | ForEach-Object { "$_/**" }) -join ','
        $args += @('--include', $includeGlobs)
    }

    $args += @(
        '--output', $outPath,
        '--style',  'xml',
        '--ignore', $IgnoreGlobs
        # NOTE: secret scanning stays ON. Never pass --no-security-check.
    )

    Write-Host ("PACK [{0}] {1} -> repomix/{2}" -f $Key, ($existing -join ' '), $OutFile) -ForegroundColor Cyan
    & npx --yes $RepomixPkg @args
    if ($LASTEXITCODE -ne 0) {
        Write-Error ("repomix failed for bundle '{0}' (exit {1})." -f $Key, $LASTEXITCODE)
        exit $LASTEXITCODE
    }
    return $true
}

# --- Run ---
Write-Host "Cowatch Repomix generation" -ForegroundColor Green
Write-Host ("Repo root : {0}" -f $RepoRoot)
Write-Host ("Output    : {0}" -f $OutDir)
Write-Host ("Runner    : npx {0}" -f $RepomixPkg)
Write-Host ""

$generated = 0
$skipped   = 0
foreach ($key in $Bundles.Keys) {
    if ($Selected.Count -gt 0 -and ($Selected -notcontains $key)) { continue }
    $b = $Bundles[$key]
    if (Invoke-RepomixBundle -Key $key -Scope $b.Scope -OutFile $b.Out) {
        $generated++
    } else {
        $skipped++
    }
}

Write-Host ""
Write-Host ("Done. Generated: {0}  Skipped (no source yet): {1}" -f $generated, $skipped) -ForegroundColor Green
if ($generated -eq 0) {
    Write-Warning "No bundles were generated. This is expected during Phase 0 (no apps/packages scaffolded yet). See repomix/manifest.md."
}
