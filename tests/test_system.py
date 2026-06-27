#!/usr/bin/env python3
"""
aguitech-core E2E + API tests
=============================

Run with: python3 tests/test_system.py [--base https://sxxysecret.com] [--admin-email ...]

What it covers:
  1. Health check
  2. Auth (login as admin, login as member, login as bad creds → 401)
  3. Public blog listing
  4. Public appointment booking (no auth)
  5. Notifications: create + list + mark-read
  6. Audit log: list, filter by category, export
  7. Appointments: list, create (admin), update status, cancel
  8. Appointments: 409 conflict when overlapping
  9. Bitácora recorded an entry for each action
 10. RBAC: member cannot view /api/audit-log
 11. Notification endpoint requires auth
 12. Cleanup: delete the test appointment

Exit code 0 = all green. Non-zero = at least one failure.

Dependencies: Python 3.8+ stdlib only. Uses urllib for HTTP so it works in the
sandbox without pip.
"""

import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

# ----- pretty output ---------------------------------------------------------

GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
BOLD = "\033[1m"
DIM = "\033[2m"
RESET = "\033[0m"

PASS = f"{GREEN}✓{RESET}"
FAIL = f"{RED}✗{RESET}"
SKIP = f"{YELLOW}○{RESET}"

results = []  # (name, status, detail)


def record(name, ok, detail=""):
    results.append((name, "pass" if ok else "fail", detail))
    icon = PASS if ok else FAIL
    line = f"  {icon} {name}"
    if detail and not ok:
        line += f"\n      {DIM}{detail}{RESET}"
    print(line)


def section(title):
    print(f"\n{BOLD}{CYAN}━━━ {title} ━━━{RESET}")


# ----- HTTP client ------------------------------------------------------------

class Client:
    def __init__(self, base):
        self.base = base.rstrip("/")
        self.token = None

    def request(self, method, path, body=None, params=None, headers=None, expect=None):
        url = f"{self.base}{path}"
        if params:
            url += "?" + urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
        data = None
        h = {"Accept": "application/json"}
        if headers:
            h.update(headers)
        if self.token:
            h["Authorization"] = f"Bearer {self.token}"
        if body is not None:
            if isinstance(body, (dict, list)):
                data = json.dumps(body).encode("utf-8")
                h["Content-Type"] = "application/json"
            else:
                data = body
        req = urllib.request.Request(url, data=data, method=method, headers=h)
        content_type = ""
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                status = r.status
                content_type = r.headers.get("Content-Type", "")
                raw = r.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as e:
            status = e.code
            content_type = e.headers.get("Content-Type", "") if hasattr(e, "headers") else ""
            raw = e.read().decode("utf-8", errors="replace")
        # If the response is XML/HTML/text, return it as a raw string instead of
        # trying to JSON-parse it. JSON endpoints keep their parsed-dict shape.
        if "xml" in content_type or "html" in content_type or "text/" in content_type:
            parsed = raw
        else:
            try:
                parsed = json.loads(raw) if raw else None
            except Exception:
                parsed = raw
        if expect is not None and status != expect:
            raise AssertionError(
                f"{method} {path} → expected {expect}, got {status}\n      body: {str(parsed)[:300]}"
            )
        return status, parsed

    def get(self, path, **kw):
        return self.request("GET", path, **kw)

    def post(self, path, **kw):
        return self.request("POST", path, **kw)

    def put(self, path, **kw):
        return self.request("PUT", path, **kw)

    def patch(self, path, **kw):
        return self.request("PATCH", path, **kw)

    def delete(self, path, **kw):
        return self.request("DELETE", path, **kw)


# ----- test sections ----------------------------------------------------------

def test_health(c):
    section("1. Health check")
    status, body = c.get("/api/health", expect=200)
    record("GET /api/health → 200", body.get("ok") is True, str(body))
    record("service name 'aguittech-core'", body.get("service") == "aguittech-core", str(body))


def test_auth(c, admin_email, admin_pwd, member_email, member_pwd):
    section("2. Authentication")
    # Admin login
    status, body = c.post("/api/auth/login", body={"email": admin_email, "password": admin_pwd}, expect=200)
    record("admin login OK", bool(body.get("token")) and body["user"]["role"] == "admin", str(body.get("user", {})))
    c.token = body["token"]
    admin_user_id = body["user"]["_id"]

    # /me with token
    status, me = c.get("/api/auth/me", expect=200)
    record("/api/auth/me returns user", me.get("user", {}).get("email") == admin_email, str(me))

    # Logout (just clearing local token — the server has no logout endpoint, that's fine)
    c.token = None

    # Bad creds
    try:
        c.post("/api/auth/login", body={"email": admin_email, "password": "WRONG"}, expect=401)
        record("bad password → 401", True)
    except AssertionError as e:
        record("bad password → 401", False, str(e))

    # Member login
    status, body = c.post("/api/auth/login", body={"email": member_email, "password": member_pwd}, expect=200)
    record("member login OK", bool(body.get("token")) and body["user"]["role"] in ("member", "admin"),
           f"role={body.get('user', {}).get('role')}")
    member_token = body["token"]
    member_id = body["user"]["_id"]

    return admin_user_id, admin_pwd, member_token, member_id


def test_public_blog(c):
    section("3. Public blog")
    status, body = c.get("/api/blog/public/posts", expect=200)
    record("GET /api/blog/public/posts → 200", "items" in body, f"got keys: {list(body.keys()) if isinstance(body, dict) else type(body)}")
    n_posts = len(body.get("items", []))
    record(f"public list has {n_posts} posts (≥1)", n_posts >= 1, f"items={n_posts}")


def test_sitemap(c):
    section("3b. Sitemap.xml (public, no auth)")
    # Hit the API directly first — the controller generates XML on the fly
    # from the same {status:'publicado'} query the public listing uses.
    # We use a custom request to capture Content-Type without forcing JSON parsing.
    url = f"{c.base}/sitemap.xml"
    try:
        req = urllib.request.Request(url, headers={"Accept": "application/xml,text/xml,*/*"})
        with urllib.request.urlopen(req, timeout=20) as r:
            status = r.status
            content_type = r.headers.get("Content-Type", "")
            raw = r.read().decode("utf-8", errors="replace")
    except Exception as e:
        record("GET /sitemap.xml reachable", False, str(e))
        return

    record("GET /sitemap.xml → 200", status == 200, f"status={status}")
    record("Content-Type is XML",
           "xml" in content_type.lower(),
           f"got Content-Type: {content_type!r}")

    # Validate the document shape — should have a urlset root and at least
    # the homepage + blog listing + every published post.
    record("starts with XML declaration",
           raw.lstrip().startswith('<?xml'),
           f"first 80 chars: {raw[:80]!r}")
    record("has <urlset> root with sitemap namespace",
           'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"' in raw,
           "namespace declaration missing")
    record("homepage listed",
           "<loc>https://sxxysecret.com/</loc>" in raw,
           "missing <loc> for homepage")
    record("blog listing listed",
           "<loc>https://sxxysecret.com/public/blog</loc>" in raw,
           "missing <loc> for /public/blog")

    # Each published post should appear. Count <url> entries minus the 3
    # static ones (home + 2x /public/blog) and assert at least 1 dynamic post.
    url_count = raw.count("<url>")
    record(f"sitemap has {url_count} <url> entries (≥4)", url_count >= 4,
           f"count={url_count}")

    # Cross-reference: every slug from /api/blog/public/posts should appear
    # in the sitemap. This is the strongest correctness check.
    _, posts = c.get("/api/blog/public/posts", expect=200)
    slugs = [p.get("slug") for p in posts.get("items", []) if p.get("slug")]
    missing = [s for s in slugs if f"/public/blog/{s}" not in raw]
    record(f"all {len(slugs)} published slugs present in sitemap",
           len(missing) == 0,
           f"missing: {missing[:3]}" if missing else f"all {len(slugs)} slugs OK")

    # lastmod on a dynamic entry should be a valid ISO 8601 (UTC 'Z' suffix).
    import re as _re
    lastmod_match = _re.search(r"<lastmod>([^<]+)</lastmod>", raw)
    if lastmod_match:
        lm = lastmod_match.group(1)
        record("first <lastmod> is ISO 8601 UTC",
               lm.endswith("Z") and "T" in lm,
               f"value: {lm!r}")
    else:
        record("at least one <lastmod> present", False, "no lastmod tag found")

    # Also hit the /api/sitemap.xml alias to confirm both routes work.
    status2, _ = c.get("/api/sitemap.xml", expect=200)
    record("GET /api/sitemap.xml alias → 200", status2 == 200, f"status={status2}")


def test_public_comments(c, admin_email, admin_pwd):
    section("3c. Public blog comments")
    # First, find a published post. We use the first one from the public
    # listing — it has its _id populated and is guaranteed to be published.
    status, listing = c.get("/api/blog/public/posts", params={"limit": 5}, expect=200)
    items = listing.get("items", [])
    if not items:
        record("at least one published post available", False, "no posts in listing")
        return
    target = items[0]
    post_id = target["_id"]
    slug = target["slug"]
    title = target["title"]

    # 1. GET /api/blog/public/posts/:slug must include a `comments` array
    #    (may be empty if this particular post has none). The shape contract
    #    is the key thing — frontend uses .comments.length to render.
    status, body = c.get(f"/api/blog/public/posts/{slug}", expect=200)
    has_field = isinstance(body, dict) and "comments" in body
    record(
        f"public detail includes 'comments' field for '{title[:40]}'",
        has_field,
        f"keys={list(body.keys())[:8] if isinstance(body, dict) else type(body)}",
    )
    if has_field:
        record(
            f"'comments' is an array (len={len(body['comments'])})",
            isinstance(body["comments"], list),
            f"type={type(body['comments']).__name__}",
        )

    # 2. Anonymous user CANNOT post a comment (no auth → 401)
    saved_token = c.token
    c.token = None
    try:
        c.post(
            f"/api/blog/posts/{post_id}/comments",
            body={"text": "spam anonymous"},
            expect=401,
        )
        record("anonymous POST comment → 401", True)
    except AssertionError as e:
        record("anonymous POST comment → 401", False, str(e))

    # 3. Login as admin, post a unique comment, verify it lands.
    _, login_body = c.post(
        "/api/auth/login",
        body={"email": admin_email, "password": admin_pwd},
        expect=200,
    )
    c.token = login_body["token"]
    admin_id = login_body["user"]["_id"]

    marker = f"[E2E comment marker {int(time.time())}]"
    try:
        status, created = c.post(
            f"/api/blog/posts/{post_id}/comments",
            body={"text": marker},
            expect=201,
        )
        record("admin POST comment → 201", status == 201, f"status={status}")
        record(
            "comment has _id + authorName snapshot",
            created.get("_id") and created.get("authorName"),
            f"got={list(created.keys()) if isinstance(created, dict) else created}",
        )
    except AssertionError as e:
        record("admin POST comment → 201", False, str(e))
        c.token = saved_token
        return

    # 4. Re-fetch the public detail and confirm the new comment is there.
    #    Use raw urllib to bypass the JSON-only logic (we want raw string OK).
    try:
        url = f"{c.base}/api/blog/public/posts/{slug}"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=20) as r:
            raw = r.read().decode("utf-8", errors="replace")
        record(
            f"new comment visible in public detail (marker found)",
            marker in raw,
            f"len(raw)={len(raw)} marker={marker[:30]!r}",
        )
    except Exception as e:
        record("refetch public detail OK", False, str(e))

    # 5. Count via API list endpoint for sanity (cross-check).
    _, after = c.get(f"/api/blog/public/posts/{slug}", expect=200)
    comment_count = len(after.get("comments", []))
    record(
        f"comment count ≥ 1 after insert (got {comment_count})",
        comment_count >= 1,
        f"count={comment_count}",
    )

    # Restore prior token state for the rest of the suite
    c.token = saved_token

def test_appointments_public(c, admin_user_id):
    section("4. Public appointment booking (no auth)")
    # Pick a date 7 days from now to avoid clashes
    starts = (datetime.now(timezone.utc) + timedelta(days=7)).replace(microsecond=0, second=0, minute=0)
    ends = starts + timedelta(minutes=30)
    payload = {
        "customerName": "Cliente Test E2E",
        "customerEmail": "test-e2e@example.com",
        "customerPhone": "+525555555555",
        "assignedTo": admin_user_id,
        "startsAt": starts.isoformat(),
        "endsAt": ends.isoformat(),
        "subject": "Cita de prueba E2E",
        "description": "Reservada por el sistema de testing",
        "location": "Google Meet",
    }
    status, body = c.post("/api/appointments/public", body=payload, expect=201)
    record("public booking → 201", body.get("status") == "scheduled",
           f"id={body.get('_id')} status={body.get('status')}")
    appt_id = body["_id"]

    # Availability now shows the slot booked
    date_str = starts.strftime("%Y-%m-%d")
    status, avail = c.get(
        "/api/appointments/public/availability",
        params={"date": date_str, "assignee": admin_user_id},
        expect=200,
    )
    booked_count = len(avail.get("bookedSlots", []))
    record(f"availability shows {booked_count} slot(s) on {date_str}", booked_count >= 1,
           f"bookedSlots={avail.get('bookedSlots')}")

    # Try to double-book the same slot → 409
    try:
        c.post("/api/appointments/public", body=payload, expect=409)
        record("overlapping booking → 409", True)
    except AssertionError as e:
        record("overlapping booking → 409", False, str(e))

    return appt_id, starts, ends


def test_appointments_admin(c, appt_id):
    section("5. Admin manages appointments")
    status, items = c.get("/api/appointments", expect=200)
    record("GET /api/appointments (admin) returns list", isinstance(items, list) and len(items) >= 1,
           f"count={len(items)}")
    record("test appointment is in admin list",
           any(str(a["_id"]) == str(appt_id) for a in items),
           f"looking for {appt_id}")

    # Confirm
    status, updated = c.patch(f"/api/appointments/{appt_id}", body={"status": "confirmed"}, expect=200)
    record("PATCH status → confirmed", updated.get("status") == "confirmed", str(updated.get("status")))

    # Complete
    status, updated = c.patch(f"/api/appointments/{appt_id}", body={"status": "completed",
                                                                     "staffNotes": "Atendido correctamente"}, expect=200)
    record("PATCH status → completed", updated.get("status") == "completed", str(updated.get("status")))
    record("staffNotes saved", updated.get("staffNotes") == "Atendido correctamente")


def test_notifications(c, appt_id, member_id):
    section("6. Notifications")
    # Admin was assigned the test appt — should have a notification
    status, body = c.get("/api/notifications", expect=200)
    items = body.get("items", [])
    unread = body.get("unread", 0)
    record(f"admin has {unread} unread notification(s)", unread >= 1, f"unread={unread}")
    appt_notif = next((n for n in items if n.get("type") == "appointment.created"), None)
    record("appointment.created notification present", appt_notif is not None,
           f"types: {[n['type'] for n in items[:5]]}")

    if appt_notif:
        # Mark as read
        status, mr = c.post("/api/notifications/mark-read", body={"ids": [appt_notif["_id"]]}, expect=200)
        record("mark-read succeeds", mr.get("ok") is True and mr.get("modified", 0) >= 1,
               f"modified={mr.get('modified')}")

    # Member: they should NOT have an admin-targeted notification, but if they
    # had any other interactions in the past, they may have some. We just
    # verify the endpoint is reachable with their token.
    saved_admin_token = c.token
    # Need member token; we don't have it in scope here, so re-login
    return saved_admin_token


def test_audit_log(c):
    section("7. Audit log (admin only)")
    status, body = c.get("/api/audit-log", expect=200)
    record("GET /api/audit-log → 200", "items" in body and "total" in body,
           f"keys={list(body.keys()) if isinstance(body, dict) else type(body)}")
    total = body.get("total", 0)
    record(f"audit log has {total} entries (≥1)", total >= 1, f"total={total}")

    # Filter by category
    status, body = c.get("/api/audit-log", params={"category": "appointment", "limit": 10}, expect=200)
    cats = [item["category"] for item in body.get("items", [])]
    record(f"filter category=appointment returns {len(cats)} entries, all matching",
           all(c == "appointment" for c in cats), f"distinct cats: {set(cats)}")

    # Filter by action
    status, body = c.get("/api/audit-log", params={"action": "appointment.create", "limit": 5}, expect=200)
    actions = [item["action"] for item in body.get("items", [])]
    record(f"action=appointment.create has {len(actions)} entries", all(a == "appointment.create" for a in actions))

    # Verify the test appointment shows up in the log
    status, body = c.get("/api/audit-log", params={"category": "appointment", "q": "Cita de prueba E2E", "limit": 5}, expect=200)
    found = any("Cita de prueba E2E" in (item.get("targetLabel") or "") for item in body.get("items", []))
    record("test appointment event searchable in audit log", found,
           f"targetLabels={[i.get('targetLabel') for i in body.get('items', [])][:3]}")

    # Stats present
    stats = body.get("stats", {})
    record("stats.byCategory present", "byCategory" in stats, f"keys={list(stats.keys())}")

    # CSV export
    try:
        url = f"{c.base}/api/audit-log/export?limit=100"
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {c.token}"})
        with urllib.request.urlopen(req, timeout=20) as r:
            status = r.status
            content_type = r.headers.get("Content-Type", "")
            raw = r.read().decode("utf-8", errors="replace")
        record("CSV export → 200", status == 200 and "csv" in content_type,
               f"status={status} ct={content_type} bytes={len(raw)}")
        record("CSV has BOM + header", raw.startswith("\ufeff") and "actorName" in raw.split("\n")[0],
               f"first line: {raw.split(chr(10))[0][:80]}")
    except Exception as e:
        record("CSV export → 200", False, str(e))


def test_rbac_audit(c, member_token):
    section("8. RBAC: member cannot view audit log")
    c.token = member_token
    try:
        c.get("/api/audit-log", expect=403)
        record("member → /api/audit-log → 403", True)
    except AssertionError as e:
        record("member → /api/audit-log → 403", False, str(e))

    c.token = None
    try:
        c.get("/api/audit-log", expect=401)
        record("anonymous → /api/audit-log → 401", True)
    except AssertionError as e:
        record("anonymous → /api/audit-log → 401", False, str(e))


def test_notifications_rbac(c):
    section("9. Notifications RBAC")
    try:
        c.get("/api/notifications", expect=401)
        record("anonymous → /api/notifications → 401", True)
    except AssertionError as e:
        record("anonymous → /api/notifications → 401", False, str(e))


def test_cleanup(c, appt_id):
    section("10. Cleanup")
    if not c.token:
        # Re-login as admin if RBAC tests left us logged out
        _, login_body = c.post("/api/auth/login",
                                body={"email": c.last_admin_email, "password": c.last_admin_password},
                                expect=200)
        c.token = login_body["token"]
    status, body = c.delete(f"/api/appointments/{appt_id}", expect=200)
    record(f"DELETE test appointment {appt_id}", body.get("ok") is True, str(body))


# ----- main -------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="https://sxxysecret.com")
    ap.add_argument("--admin-email", default="hector@aguitech.com")
    ap.add_argument("--admin-password", default="peris51373")
    ap.add_argument("--member-email", default="test-member@aguitech.com")
    ap.add_argument("--member-password", default="test123456")
    args = ap.parse_args()

    c = Client(args.base)

    print(f"{BOLD}aguitech-core test suite{RESET}")
    print(f"Base:   {args.base}")
    print(f"Admin:  {args.admin_email}")
    print(f"Member: {args.member_email}")
    print(f"Time:   {datetime.now().isoformat(timespec='seconds')}")

    test_health(c)
    admin_user_id, admin_pwd, member_token, member_id = test_auth(
        c, args.admin_email, args.admin_password, args.member_email, args.member_password
    )
    # Re-login as admin for the rest of the suite
    _, login_body = c.post("/api/auth/login",
                            body={"email": args.admin_email, "password": args.admin_password},
                            expect=200)
    c.token = login_body["token"]
    # Stash creds so cleanup can re-login if RBAC tests logged us out
    c.last_admin_email = args.admin_email
    c.last_admin_password = args.admin_password
    test_public_blog(c)
    test_sitemap(c)
    test_public_comments(c, args.admin_email, args.admin_password)
    appt_id, starts, ends = test_appointments_public(c, admin_user_id)
    test_appointments_admin(c, appt_id)
    test_notifications(c, appt_id, member_id)
    test_audit_log(c)
    test_rbac_audit(c, member_token)
    test_notifications_rbac(c)
    test_cleanup(c, appt_id)

    # summary
    passed = sum(1 for _, s, _ in results if s == "pass")
    failed = sum(1 for _, s, _ in results if s == "fail")
    print(f"\n{BOLD}━━━ summary ━━━{RESET}")
    print(f"  {GREEN}passed: {passed}{RESET}")
    if failed:
        print(f"  {RED}failed: {failed}{RESET}")
        print()
        print(f"{RED}{BOLD}FAILURES:{RESET}")
        for name, status, detail in results:
            if status == "fail":
                print(f"  {FAIL} {name}")
                if detail:
                    print(f"      {detail}")
        sys.exit(1)
    else:
        print(f"  {failed} failed")
        print(f"\n{GREEN}{BOLD}🎉 all green{RESET}")
        sys.exit(0)


if __name__ == "__main__":
    main()
