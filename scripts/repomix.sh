#!/usr/bin/env bash
#
# repomix.sh — Generate all Cowatch Repomix bundles into the repomix/ folder.
#
# Packs the monorepo into the seven canonical XML bundles defined in
# repomix/manifest.md, using `npx repomix` once per bundle with the
# appropriate source scope and --output flag.
#
# Bundles produced (into <repoRoot>/repomix/):
#   full-project.xml  -> whole repo             (scope: repo root)
#   backend.xml       -> NestJS server          (scope: apps/server)
#   frontend.xml      -> React web app          (scope: apps/web)
#   electron.xml      -> Electron desktop shell (scope: apps/desktop)
#   realtime.xml      -> realtime abstraction   (scope: packages/realtime)
#   social.xml        -> social shared logic    (scope: packages/social)
#   deployment.xml    -> docker + scripts infra (scope: docker, scripts)
#
# Process rules R2/R3/R4 (see context/architecture.md §10): every architectural
# change must regenerate the affected bundle(s). This script is the canonical
# generator. Bundles are git-ignored build outputs.
#
# PLANNING-PHASE SAFETY: each bundle is skipped (with a warning) if its source
# root does not yet exist. During Phase 0 most roots are absent, so running this
# now is a no-op for those bundles — the apps do not exist yet. DO NOT rely on
# output until code exists (Phase 1+).
#
# Usage:
#   bash scripts/repomix.sh                  # all bundles whose source exists
#   bash scripts/repomix.sh realtime backend # only the named bundles
#   REPOMIX_VERSION=0.2.0 bash scripts/repomix.sh  # pin version (CI reproducibility)
#
set -euo pipefail

# --- Resolve repo root (script lives in <root>/scripts) and cd to it ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

OUT_DIR="${REPO_ROOT}/repomix"
mkdir -p "${OUT_DIR}"

# --- Locate the repomix runner (npx, optionally version-pinned) ---
if ! command -v npx >/dev/null 2>&1; then
  echo "ERROR: npx not found on PATH. Install Node.js (https://nodejs.org) and re-run." >&2
  exit 1
fi
if [ -n "${REPOMIX_VERSION:-}" ]; then
  REPOMIX_PKG="repomix@${REPOMIX_VERSION}"
else
  REPOMIX_PKG="repomix"
fi

# --- Shared ignore patterns (in addition to .gitignore, which repomix honors) ---
# NEVER pack: prior bundles, secrets, build outputs, deps, generated client.
IGNORE_GLOBS="repomix/**,**/node_modules/**,**/dist/**,**/.turbo/**,**/.next/**,**/out/**,**/release/**,**/coverage/**,**/*.env,**/.env*,**/*.pem,**/*.key,**/generated/**,**/prisma/generated/**,**/*.log"

# --- Bundle definitions: "key|out|scope1 scope2 ..." ---
# Scope is one or more relative roots passed to repomix.
BUNDLES=(
  "full|full-project.xml|."
  "backend|backend.xml|apps/server"
  "frontend|frontend.xml|apps/web"
  "electron|electron.xml|apps/desktop"
  "realtime|realtime.xml|packages/realtime"
  "social|social.xml|packages/social"
  "deployment|deployment.xml|docker scripts"
)

# --- Selection filter (positional args = bundle keys) ---
SELECTED=("$@")

selected_contains() {
  # $1 = key. Returns 0 if no selection (run all) or key is in selection.
  if [ "${#SELECTED[@]}" -eq 0 ]; then return 0; fi
  local k
  for k in "${SELECTED[@]}"; do
    [ "${k}" = "$1" ] && return 0
  done
  return 1
}

# Validate any explicitly requested keys up front.
if [ "${#SELECTED[@]}" -gt 0 ]; then
  VALID_KEYS="full backend frontend electron realtime social deployment"
  for req in "${SELECTED[@]}"; do
    case " ${VALID_KEYS} " in
      *" ${req} "*) : ;;
      *) echo "ERROR: unknown bundle key '${req}'. Valid: ${VALID_KEYS}" >&2; exit 1 ;;
    esac
  done
fi

run_bundle() {
  local key="$1" out="$2" scope="$3"
  local out_path="${OUT_DIR}/${out}"

  # Planning-phase guard: collect scope roots that actually exist.
  local existing=()
  local root
  for root in ${scope}; do
    if [ -e "${REPO_ROOT}/${root}" ]; then
      existing+=("${root}")
    fi
  done

  if [ "${#existing[@]}" -eq 0 ]; then
    echo "SKIP [${key}] -> ${out}: source root(s) '${scope}' do not exist yet (expected during Phase 0; code not scaffolded)." >&2
    return 1
  fi

  # Build args: single root -> positional; multiple roots -> root + --include.
  local -a args=()
  if [ "${#existing[@]}" -eq 1 ]; then
    args+=("${existing[0]}")
  else
    args+=(".")
    local include=""
    for root in "${existing[@]}"; do
      if [ -z "${include}" ]; then include="${root}/**"; else include="${include},${root}/**"; fi
    done
    args+=("--include" "${include}")
  fi

  args+=(--output "${out_path}" --style xml --ignore "${IGNORE_GLOBS}")
  # NOTE: secret scanning stays ON. Never pass --no-security-check.

  echo "PACK [${key}] ${existing[*]} -> repomix/${out}"
  npx --yes "${REPOMIX_PKG}" "${args[@]}"
  return 0
}

echo "Cowatch Repomix generation"
echo "Repo root : ${REPO_ROOT}"
echo "Output    : ${OUT_DIR}"
echo "Runner    : npx ${REPOMIX_PKG}"
echo ""

generated=0
skipped=0
for entry in "${BUNDLES[@]}"; do
  IFS='|' read -r key out scope <<<"${entry}"
  selected_contains "${key}" || continue
  if run_bundle "${key}" "${out}" "${scope}"; then
    generated=$((generated + 1))
  else
    skipped=$((skipped + 1))
  fi
done

echo ""
echo "Done. Generated: ${generated}  Skipped (no source yet): ${skipped}"
if [ "${generated}" -eq 0 ]; then
  echo "WARNING: No bundles were generated. Expected during Phase 0 (no apps/packages scaffolded yet). See repomix/manifest.md." >&2
fi
