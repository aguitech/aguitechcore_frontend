#!/usr/bin/env bash
# traefik_sitemap_autoheal.sh
# ----------------------------------------------------------
# Detect when EasyPanel has wiped our custom Traefik routers for
# /sitemap.xml and /robots.txt, and re-apply them.
#
# Symptom: grep -c sxxysecret /data/config/main.yaml drops from
# the expected baseline (34 with our routers) to 25 (without).
#
# How to find the Traefik container:
#   docker ps --filter name=traefik --format '{{.Names}}'
#
# What it does:
#   1. Locate the running easypanel-traefik container.
#   2. docker cp main.yaml to /tmp for inspection.
#   3. Count sxxysecret references — if below threshold, re-apply patch.
#   4. Append the 3 sitemap routers into the routers section using Python
#      (YAML-safe). Use exact-string anchors to avoid drift.
#   5. docker cp back + kill -s HUP for hot reload.
#   6. Verify with curl that /sitemap.xml now returns XML, not HTML.
#   7. Log to /var/log/traefik-autoheal.log (rotated by logrotate if you set it up).
#
# Exit codes:
#   0 = all good (no action needed, or action succeeded)
#   1 = traefik container not found
#   2 = main.yaml missing or unreadable
#   3 = patch failed to apply
#   4 = verification after reload still fails
# ----------------------------------------------------------

set -euo pipefail

LOG_FILE="/var/log/traefik-autoheal.log"
THRESHOLD=30   # 25 = baseline without sitemap routers, 34 = with
EXPECTED_XML_LINES=10  # minimum <url> entries we expect in a real sitemap

log() {
  local ts
  ts="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  echo "[$ts] $*" | tee -a "$LOG_FILE"
}

# Ensure log file is writable (sudo if needed)
if ! touch "$LOG_FILE" 2>/dev/null; then
  LOG_FILE="/tmp/traefik-autoheal.log"
  touch "$LOG_FILE"
fi

# 1. Find Traefik container
TRAEFIK_CID=$(docker ps --filter name=traefik --format '{{.Names}}' | head -1 || true)
if [ -z "$TRAEFIK_CID" ]; then
  log "ERROR: no running traefik container found"
  exit 1
fi
log "traefik container: $TRAEFIK_CID"

# 2. Pull main.yaml
TMPFILE=$(mktemp /tmp/main.XXXXXX.yaml)
trap "rm -f $TMPFILE" EXIT
docker cp "$TRAEFIK_CID":/data/config/main.yaml "$TMPFILE"

if [ ! -s "$TMPFILE" ]; then
  log "ERROR: main.yaml is empty or missing"
  exit 2
fi

# 3. Count sxxysecret references — proxy for "are our routers present?"
SXX_COUNT=$(grep -c sxxysecret "$TMPFILE" || true)
log "main.yaml has $SXX_COUNT sxxysecret references (threshold: $THRESHOLD)"

# Also check whether the sitemap routers are actually in there
HAS_SITEMAP=$(grep -c "sitemap\|robots.txt" "$TMPFILE" || true)
log "sitemap/robots markers in main.yaml: $HAS_SITEMAP"

if [ "$SXX_COUNT" -ge "$THRESHOLD" ] && [ "$HAS_SITEMAP" -ge 3 ]; then
  log "OK — sitemap routers are present, no action needed"
  exit 0
fi

log "ROUTERS MISSING — re-applying patch"

# 4. Apply the patch using Python (safer than sed for YAML).
# We insert 3 new routers right after the last existing "https-www-sxxysecret-api"
# entry, using a unique anchor.
python3 - "$TMPFILE" <<'PYEOF'
import sys, re, json

path = sys.argv[1]
with open(path, 'r', encoding='utf-8') as f:
    raw = f.read()

# Anchors: locate the closing brace of https-www-sxxysecret-api and insert
# immediately after. The block is uniquely identifiable.
anchor_start = '"https-www-sxxysecret-api": {'
idx = raw.find(anchor_start)
if idx == -1:
    print("ERROR: anchor not found", file=sys.stderr)
    sys.exit(3)

# Find the matching closing brace by counting depth from idx
i = idx + len(anchor_start)
depth = 0
while i < len(raw):
    c = raw[i]
    if c == '{':
        depth += 1
    elif c == '}':
        if depth == 0:
            break
        depth -= 1
    i += 1
if depth != 0 or i >= len(raw):
    print("ERROR: unbalanced braces", file=sys.stderr)
    sys.exit(3)

# Insert the new routers right after the closing brace + comma
# raw[i] == '}', then we want to insert AFTER the next comma+newline
# Find the comma after the closing brace
end_of_block = i + 1  # position right after '}'
insertion_point = end_of_block

# Skip past whitespace + comma (if present)
while insertion_point < len(raw) and raw[insertion_point] in ' \t\r\n,':
    insertion_point += 1

# Now insertion_point is at the start of the next router entry.
# We want to insert OUR block BEFORE that.
block_to_insert = '''      "https-sxxysecret-sitemap": {
        "service": "web_sxxysecret_com-api",
        "rule": "Host(`sxxysecret.com`) && (Path(`/sitemap.xml`) || Path(`/robots.txt`))",
        "priority": 200,
        "tls": {
          "certResolver": "letsencrypt"
        },
        "entryPoints": [
          "https"
        ]
      },
      "https-www-sxxysecret-sitemap": {
        "service": "web_sxxysecret_com-api",
        "rule": "Host(`www.sxxysecret.com`) && (Path(`/sitemap.xml`) || Path(`/robots.txt`))",
        "priority": 200,
        "tls": {
          "certResolver": "letsencrypt"
        },
        "entryPoints": [
          "https"
        ]
      },
      "http-sxxysecret-sitemap": {
        "service": "web_sxxysecret_com-api",
        "rule": "Host(`sxxysecret.com`) && (Path(`/sitemap.xml`) || Path(`/robots.txt`))",
        "middlewares": [
          "redirect-to-https"
        ],
        "entryPoints": [
          "http"
        ],
        "priority": 200
      },
      '''

new_raw = raw[:insertion_point] + block_to_insert + raw[insertion_point:]
with open(path, 'w', encoding='utf-8') as f:
    f.write(new_raw)
print("PATCHED")
PYEOF

if [ $? -ne 0 ]; then
  log "ERROR: python patch failed"
  exit 3
fi

# 5. Push back + SIGHUP
docker cp "$TMPFILE" "$TRAEFIK_CID":/data/config/main.yaml
docker kill -s HUP "$TRAEFIK_CID" >/dev/null 2>&1 || true
sleep 4

# 6. Verify
NEW_COUNT=$(docker exec "$TRAEFIK_CID" grep -c sxxysecret /data/config/main.yaml || echo 0)
log "after patch: $NEW_COUNT sxxysecret refs"

# Hit the public sitemap to confirm it returns XML
SITEMAP_CT=$(curl -sS -o /tmp/sitemap_check.xml -w '%{http_code}|%{content_type}' https://sxxysecret.com/sitemap.xml || echo "ERR")
SITEMAP_BODY_LINES=$(wc -l < /tmp/sitemap_check.xml 2>/dev/null || echo 0)
log "verification: https://sxxysecret.com/sitemap.xml → $SITEMAP_CT, body has $SITEMAP_BODY_LINES lines"

# Validation: must be 200 + application/xml + ≥ EXPECTED_XML_LINES lines
case "$SITEMAP_CT" in
  200\|*xml*)
    if [ "$SITEMAP_BODY_LINES" -lt "$EXPECTED_XML_LINES" ]; then
      log "WARN: sitemap returned 200 + XML but only $SITEMAP_BODY_LINES lines (expected ≥ $EXPECTED_XML_LINES)"
      exit 4
    fi
    log "✅ auto-heal succeeded — sitemap is live again"
    exit 0
    ;;
  *)
    log "ERROR: sitemap verification failed (got: $SITEMAP_CT)"
    exit 4
    ;;
esac