#!/usr/bin/env bash
# =============================================================================
#  deploy-client.sh — atomic client deploy for sxxysecret_web
#
#  WHY THIS EXISTS (the 2026-11-12 outage)
#  ------------------------------------------
#  The web container serves `/code/client/public` (NOT `dist/`):
#      command=... cd /code/client && exec npx -y serve public -l tcp://0.0.0.0:80
#  `vite build` writes the hashed bundles to `dist/assets/`, but `serve` reads
#  `public/`. The manual deploy steps were:
#      cp dist/index.html public/index.html        <-- always done
#      cp -r dist/assets/* public/assets/           <-- EASILY FORGOTTEN
#  Forgetting the second step leaves `public/index.html` pointing at
#  `/assets/index-<hash>.js` that does not exist -> EVERY bundle 404s ->
#  the SPA never mounts (root.innerHTML.length === 0) -> the whole site is
#  blank while `/` still returns HTTP 200. That is exactly what happened on
#  2026-11-12: the site looked GREEN to every health probe and was dead.
#
#  This script makes that failure impossible:
#    1. builds with vite
#    2. copies index.html AND the whole assets/ tree (atomically)
#    3. verifies the referenced hashes actually exist in public/
#    4. verifies the served URLs over HTTP
#    5. restarts the swarm service and waits for convergence
#
#  USAGE
#      bash deploy-client.sh [--target <dir>] [--no-restart] [--dry-run]
#
#      --target   directory that receives the build (default: the live VPS
#                 bind-mount). Point it at the repo's own client/public for
#                 a local build.
#      --dry-run  run every step but DO NOT write to the target.
# =============================================================================
set -uo pipefail

export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

# ── config ──────────────────────────────────────────────────────────────────
CLIENT_DIR="${CLIENT_DIR:-/etc/easypanel/projects/web/sxxysecret_web/code/client}"
TARGET=""
DO_RESTART=1
DRY_RUN=0
SERVICE="web_sxxysecret_web"
PUBLIC_HOST="https://sxxysecret.com"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)    TARGET="$2"; shift 2 ;;
    --no-restart) DO_RESTART=0; shift ;;
    --dry-run)   DRY_RUN=1; shift ;;
    -h|--help)   sed -n '2,40p' "$0"; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

[[ -z "$TARGET" ]] && TARGET="$CLIENT_DIR/public"

log()  { printf '[deploy-client] %s\n' "$*"; }
fail() { printf '[deploy-client] ERROR: %s\n' "$*" >&2; exit 1; }

# ── preflight ───────────────────────────────────────────────────────────────
[[ -d "$CLIENT_DIR" ]] || fail "client dir not found: $CLIENT_DIR"
[[ -f "$CLIENT_DIR/package.json" ]] || fail "no package.json in $CLIENT_DIR"
[[ -d "$CLIENT_DIR/node_modules" ]] || fail "no node_modules in $CLIENT_DIR (npm ci needed)"
[[ -f "$CLIENT_DIR/public/serve.json" ]] || fail "public/serve.json missing — the rewrites would be lost"

log "client dir : $CLIENT_DIR"
log "target     : $TARGET"

# ── 1. build ────────────────────────────────────────────────────────────────
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh" >/dev/null 2>&1 || true
fi

log "building (vite build)..."
BUILD_LOG="$(mktemp)"
if ! (cd "$CLIENT_DIR" && npm run build) >"$BUILD_LOG" 2>&1; then
  tail -30 "$BUILD_LOG" >&2
  rm -f "$BUILD_LOG"
  fail "vite build FAILED — target left untouched"
fi
tail -5 "$BUILD_LOG"
rm -f "$BUILD_LOG"

DIST="$CLIENT_DIR/dist"
[[ -f "$DIST/index.html" ]] || fail "build produced no dist/index.html"
[[ -d "$DIST/assets" ]]     || fail "build produced no dist/assets/ — aborting before touching the target"
log "build OK: $(ls -1 "$DIST/assets" | wc -l) asset file(s)"

# ── 2. verify the build is internally consistent ───────────────────────────
# The HTML must reference bundles that the build actually produced.
mapfile -t WANTED < <(grep -oE '/assets/[A-Za-z0-9._-]+' "$DIST/index.html" | sort -u)
[[ ${#WANTED[@]} -gt 0 ]] || fail "dist/index.html references no /assets/* — broken build"

for w in "${WANTED[@]}"; do
  base="${w#/assets/}"
  [[ -f "$DIST/assets/$base" ]] || fail "dist/index.html references /assets/$base but the build did not produce it"
done
log "index.html references ${#WANTED[@]} asset(s), all present in dist/assets"

# ── 3. publish into the target (atomic-ish) ────────────────────────────────
if [[ "$DRY_RUN" == "1" ]]; then
  log "DRY-RUN: would copy dist/index.html -> $TARGET/index.html"
  log "DRY-RUN: would copy dist/assets/  -> $TARGET/assets/"
else
  mkdir -p "$TARGET/assets"

  # assets first: the HTML that points at them must not be live before they are
  if [[ -d "$TARGET/assets" ]]; then
    # keep the previous bundle around for one deploy so a rollback is possible
    if [[ -d "$TARGET/assets.prev" ]]; then rm -rf "$TARGET/assets.prev"; fi
    cp -a "$TARGET/assets" "$TARGET/assets.prev" 2>/dev/null || true
  fi
  rm -rf "$TARGET/assets"
  cp -a "$DIST/assets" "$TARGET/assets"

  cp -a "$DIST/index.html" "$TARGET/index.html"

  # serve.json is the source of truth for the rewrites and lives in public/.
  # It is NOT a build artifact — never overwrite it from dist/.
  if [[ -f "$DIST/serve.json" && -f "$TARGET/serve.json" ]]; then
    log "keeping target serve.json (not a build artifact)"
  fi
  log "published: index.html + assets/ ($(ls -1 "$TARGET/assets" | wc -l) files)"
fi

# ── 4. verify the TARGET resolves the referenced assets ─────────────────────
if [[ "$DRY_RUN" != "1" ]]; then
  for w in "${WANTED[@]}"; do
    base="${w#/assets/}"
    [[ -f "$TARGET/assets/$base" ]] || fail "POST-COPY FAIL: $TARGET/assets/$base is missing"
  done
  log "post-copy verification OK (every referenced asset exists in the target)"
fi

# ── 5. restart + converge ──────────────────────────────────────────────────
if [[ "$DO_RESTART" == "1" && "$DRY_RUN" != "1" ]]; then
  log "restarting $SERVICE ..."
  docker service update --force "$SERVICE" >/dev/null 2>&1 || fail "docker service update failed"
  for i in $(seq 1 24); do
    code=$(curl -sk -o /dev/null -w "%{http_code}" --max-time 8 "$PUBLIC_HOST/")
    [[ "$code" == "200" ]] && { log "converged after ${i}0s"; break; }
    sleep 10
  done
fi

# ── 6. HTTP verification of the real served URLs ───────────────────────────
if [[ "$DRY_RUN" != "1" ]]; then
  echo
  log "== HTTP VERIFICATION =="
  rc=0
  for w in "${WANTED[@]}"; do
    code=$(curl -sk -o /dev/null -w "%{http_code}" --max-time 15 "$PUBLIC_HOST$w")
    printf '  %-4s %s\n' "$code" "$PUBLIC_HOST$w"
    [[ "$code" == "200" ]] || rc=1
  done
  # the blog deep link must resolve — its rewrite lives in serve.json
  blogslug=$(curl -sk --max-time 15 "$PUBLIC_HOST/sitemap.xml" \
    | grep -oE '<loc>[^<]*/public/blog/[^<]+</loc>' | head -1 \
    | sed -E 's|.*/public/blog/([^<]*)</loc>.*|\1|')
  if [[ -n "$blogslug" ]]; then
    code=$(curl -sk -o /dev/null -w "%{http_code}" --max-time 15 "$PUBLIC_HOST/public/blog/$blogslug")
    printf '  %-4s %s\n' "$code" "$PUBLIC_HOST/public/blog/${blogslug:0:58}"
    [[ "$code" == "200" ]] || rc=1
  else
    printf '  %-4s %s\n' "SKIP" "no blog slug found in sitemap.xml"
  fi
  # sub-apps must NOT regress — the catch-all rewrite trap
  for sub in ciudad juego; do
    size=$(curl -skL --max-time 15 "$PUBLIC_HOST/$sub" | wc -c)
    printf '  %-4s %s (%s bytes)\n' "$size" "$PUBLIC_HOST/$sub" "$size"
    [[ "$size" -gt 20000 ]] || { echo "  ^^ WARNING: /$sub looks like the SPA shell, not the sub-app"; rc=1; }
  done
  echo
  [[ "$rc" == "0" ]] && log "ALL CHECKS GREEN" || fail "one or more HTTP checks FAILED"
fi

log "done."
