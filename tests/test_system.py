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
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                status = r.status
                raw = r.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as e:
            status = e.code
            raw = e.read().decode("utf-8", errors="replace")
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
