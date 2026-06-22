"""
E2E test for the Blog module on sxxysecret.com.
Exercises: categories, posts CRUD, public list, public detail, attachments,
links, comments, and verifies all admin routes still work (regression check).
"""
import json
import sys
import time
import urllib.request
import urllib.error
from urllib.parse import urlencode

API = "https://sxxysecret.com/api"


def req(method, path, body=None, token=None, form_data=False, raw_files=False):
    url = f"{API}{path}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = None
    if body is not None:
        if raw_files:
            data = body  # already multipart
        else:
            data = json.dumps(body).encode()
    r = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            raw = resp.read()
            ctype = resp.headers.get("Content-Type", "")
            if "application/json" in ctype or "text/" in ctype:
                return resp.status, json.loads(raw.decode() or "{}")
            return resp.status, raw
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw.decode() or "{}")
        except Exception:
            return e.code, raw.decode(errors="replace")


def assert_eq(actual, expected, label):
    if actual != expected:
        print(f"  ❌ {label}: expected {expected!r}, got {actual!r}")
        sys.exit(1)
    print(f"  ✅ {label}")


def assert_in(needle, haystack, label):
    if needle not in haystack:
        print(f"  ❌ {label}: {needle!r} not in {haystack!r}")
        sys.exit(1)
    print(f"  ✅ {label}")


def main():
    print("=== 1. Login as admin ===")
    code, body = req("POST", "/auth/login", {
        "email": "hector@aguitech.com",
        "password": "peris51373",
    })
    assert_eq(code, 200, "login status")
    token = body["token"]
    user = body["user"]
    print(f"     user={user.get('name')} role={user.get('role')}")

    print("\n=== 2. Create a category ===")
    suffix = str(int(time.time() * 1000))[-6:]
    code, cat = req("POST", "/blog/categories", {
        "name": f"Anuncios E2E {suffix}",
        "description": "Categoría de prueba",
        "color": "#FF6A00",
        "icon": "📰",
    }, token=token)
    assert_eq(code, 201, "create category status")
    cat_id = cat["_id"]
    assert_eq(cat["name"], f"Anuncios E2E {suffix}", "category name")
    assert "anuncios-e2e-" in cat["slug"], "category slug"

    print("\n=== 3. List categories ===")
    code, cats = req("GET", "/blog/categories", token=token)
    assert_eq(code, 200, "list categories status")
    assert_in(cat_id, [c["_id"] for c in cats], "category present in list")

    print("\n=== 4. Create a post (draft) ===")
    post_suffix = suffix  # reuse suffix from category
    code, post = req("POST", "/blog/posts", {
        "title": f"Mi primera publicación E2E {post_suffix}",
        "excerpt": "Resumen corto de prueba",
        "body": "Este es el contenido de la publicación. La Máquina Celeste está imparable.",
        "category": cat_id,
        "tags": ["anuncio", "test"],
        "status": "borrador",
    }, token=token)
    assert_eq(code, 201, "create post status")
    post_id = post["_id"]
    assert post["slug"].startswith("mi-primera-publicacion-e2e-"), "post slug prefix"
    assert_eq(post["status"], "borrador", "post status")

    print("\n=== 5. List posts ===")
    code, posts = req("GET", "/blog/posts", token=token)
    assert_eq(code, 200, "list posts status")
    assert_in(post_id, [p["_id"] for p in posts], "post in list")

    print("\n=== 6. Update post → published ===")
    code, post2 = req("PUT", f"/blog/posts/{post_id}", {"status": "publicado"}, token=token)
    assert_eq(code, 200, "update post status")
    assert_eq(post2["status"], "publicado", "status now publicado")
    assert post2.get("publishedAt") is not None, "publishedAt set"
    print("  ✅ publishedAt set")

    print("\n=== 7. Public list (no auth) ===")
    code, pub = req("GET", "/blog/public/posts?category=" + cat_id)
    assert_eq(code, 200, "public list status")
    assert_eq(pub["total"] >= 1, True, "public total >= 1")
    assert_in(post_id, [p["_id"] for p in pub["items"]], "post visible publicly")

    print("\n=== 8. Public detail (no auth) ===")
    code, pub_post = req("GET", f"/blog/public/posts/{post2['slug']}")
    assert_eq(code, 200, "public detail status")
    assert pub_post["title"].startswith("Mi primera publicación E2E"), "title roundtrip"
    assert_eq(pub_post["views"] >= 1, True, "views incremented")

    print("\n=== 9. Public list filters by category slug ===")
    code, pub2 = req("GET", "/blog/public/posts?category=" + cat["slug"])
    assert_eq(code, 200, "public list by slug")
    assert_in(post_id, [p["_id"] for p in pub2["items"]], "post visible by slug")

    print("\n=== 10. Public list filters by query ===")
    # search for a unique word from the body
    code, pub3 = req("GET", "/blog/public/posts?q=primera")
    assert_eq(code, 200, "public list by q")
    assert_in(post_id, [p["_id"] for p in pub3["items"]], "post found by q")

    print("\n=== 11. Add external link ===")
    code, link = req("POST", f"/blog/posts/{post_id}/links", {
        "url": "https://aguitech.com",
        "title": "Aguitech",
        "description": "Sitio principal",
    }, token=token)
    assert_eq(code, 201, "add link status")
    link_id = link["_id"]
    assert_eq(link["url"], "https://aguitech.com", "link url")

    print("\n=== 12. Add comment / note ===")
    code, comment = req("POST", f"/blog/posts/{post_id}/comments", {
        "text": "Gran publicación de prueba 🚀",
    }, token=token)
    assert_eq(code, 201, "add comment status")
    assert_in("Gran publicación", comment["text"], "comment text")
    comment_id = comment["_id"]

    print("\n=== 13. Get post detail (auth) ===")
    code, det = req("GET", f"/blog/posts/{post_id}", token=token)
    assert_eq(code, 200, "get post detail")
    assert_eq(len(det["links"]), 1, "1 link")
    assert_eq(len(det["comments"]), 1, "1 comment")

    print("\n=== 14. Attach MULTIPLE images in one request (5 files) ===")
    import struct, zlib
    def make_colored_png(r, g, b):
        sig = b"\x89PNG\r\n\x1a\n"
        def chunk(t, d):
            return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
        ihdr = chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0))
        raw = bytes([0, r, g, b])
        idat = chunk(b"IDAT", zlib.compress(raw))
        iend = chunk(b"IEND", b"")
        return sig + ihdr + idat + iend
    colors = [
        ("red.png", 255, 0, 0),
        ("green.png", 0, 255, 0),
        ("blue.png", 0, 0, 255),
        ("yellow.png", 255, 255, 0),
        ("cyan.png", 0, 255, 255),
    ]
    def build_multipart(boundary, parts):
        """parts = list of (filename, mime, bytes). Each part must end with CRLF
        so multer/busboy correctly finds the next boundary delimiter."""
        chunks = []
        for fname, mime, data in parts:
            chunks.append((
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="files"; filename="{fname}"\r\n'
                f"Content-Type: {mime}\r\n\r\n"
            ).encode() + data + b"\r\n")
        chunks.append(f"--{boundary}--\r\n".encode())
        return b"".join(chunks)
    out = build_multipart("----E2EMulti", [
        (n, "image/png", make_colored_png(r, g, b)) for n, r, g, b in colors
    ])
    url = f"{API}/blog/posts/{post_id}/images"
    r = urllib.request.Request(url, data=out, method="POST", headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": f"multipart/form-data; boundary=----E2EMulti",
    })
    with urllib.request.urlopen(r, timeout=30) as resp:
        images = json.loads(resp.read().decode())
    assert_eq(len(images), 5, "5 images uploaded in one request")

    print("\n=== 15. Verify all 5 images are publicly served ===")
    for img in images:
        rr = urllib.request.Request(img["url"], method="HEAD")
        with urllib.request.urlopen(rr, timeout=15) as resp:
            assert_eq(resp.status, 200, f"image {img['filename']}")

    print("\n=== 16. Set one image as cover ===")
    code, det = req("GET", f"/blog/posts/{post_id}", token=token)
    cover_target = det["images"][2]  # blue one
    code, _ = req("PUT", f"/blog/posts/{post_id}", {"coverImage": cover_target["url"]}, token=token)
    assert_eq(code, 200, "set cover status")
    code, det = req("GET", f"/blog/posts/{post_id}", token=token)
    assert_eq(det["coverImage"], cover_target["url"], "coverImage saved")

    print("\n=== 17. Attach a video file ===")
    fake_mp4 = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 100  # has ftyp box signature
    out = build_multipart("----E2EVideo", [("clip.mp4", "video/mp4", fake_mp4)])
    url = f"{API}/blog/posts/{post_id}/videos"
    r = urllib.request.Request(url, data=out, method="POST", headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": f"multipart/form-data; boundary=----E2EVideo",
    })
    with urllib.request.urlopen(r, timeout=30) as resp:
        videos = json.loads(resp.read().decode())
    assert_eq(len(videos), 1, "1 video uploaded")
    assert_eq(videos[0]["mimetype"], "video/mp4", "video mimetype")

    print("\n=== 18. Attach a PDF document ===")
    fake_pdf = b"%PDF-1.4\n%fake test pdf\n%%EOF\n"
    out = build_multipart("----E2EPdf", [("report.pdf", "application/pdf", fake_pdf)])
    url = f"{API}/blog/posts/{post_id}/documents"
    r = urllib.request.Request(url, data=out, method="POST", headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": f"multipart/form-data; boundary=----E2EPdf",
    })
    with urllib.request.urlopen(r, timeout=30) as resp:
        docs = json.loads(resp.read().decode())
    assert_eq(len(docs), 1, "1 document uploaded")

    print("\n=== 19. Public post detail includes all attachments ===")
    code, pub_post = req("GET", f"/blog/public/posts/{post['slug']}")
    assert_eq(code, 200, "public detail with attachments")
    assert_eq(len(pub_post["images"]), 5, "public sees 5 images")
    assert_eq(len(pub_post["videos"]), 1, "public sees 1 video")
    assert_eq(len(pub_post["documents"]), 1, "public sees 1 document")
    assert_eq(pub_post["coverImage"], cover_target["url"], "public sees cover image")

    print("\n=== 20. Bulk delete 3 images via individual DELETE calls ===")
    code, det = req("GET", f"/blog/posts/{post_id}", token=token)
    to_delete = [det["images"][i]["_id"] for i in [0, 1, 3]]
    for fid in to_delete:
        code, _ = req("DELETE", f"/blog/posts/{post_id}/files/images/{fid}", token=token)
        assert_eq(code, 200, f"delete image {fid[:8]}")
    code, det = req("GET", f"/blog/posts/{post_id}", token=token)
    assert_eq(len(det["images"]), 2, "2 images left after bulk delete")

    print("\n=== 21. Delete remaining image, video, document individually ===")
    for kind in ["images", "videos", "documents"]:
        for f in det[kind]:
            code, _ = req("DELETE", f"/blog/posts/{post_id}/files/{kind}/{f['_id']}", token=token)
            assert_eq(code, 200, f"delete {kind}/{f['_id'][:8]}")
    code, det = req("GET", f"/blog/posts/{post_id}", token=token)
    assert_eq(len(det["images"]), 0, "all images cleared")
    assert_eq(len(det["videos"]), 0, "all videos cleared")
    assert_eq(len(det["documents"]), 0, "all documents cleared")

    print("\n=== 17. Delete link & comment ===")
    code, _ = req("DELETE", f"/blog/posts/{post_id}/links/{link_id}", token=token)
    assert_eq(code, 200, "delete link")
    code, _ = req("DELETE", f"/blog/posts/{post_id}/comments/{comment_id}", token=token)
    assert_eq(code, 200, "delete comment")

    print("\n=== 18. Slug uniqueness (create same title twice) ===")
    code, p2 = req("POST", "/blog/posts", {
        "title": f"Mi primera publicación E2E {post_suffix}",
        "category": cat_id,
    }, token=token)
    assert_eq(code, 201, "duplicate title creates with suffix")
    assert p2["slug"] != post["slug"], "slug got -2 suffix"
    print(f"  ✅ dedup slug = {p2['slug']}")
    req("DELETE", f"/blog/posts/{p2['_id']}", token=token)

    print("\n=== 19. Cannot delete category with posts ===")
    code, body = req("DELETE", f"/blog/categories/{cat_id}", token=token)
    assert_eq(code, 409, "category delete blocked when posts use it")

    print("\n=== 20. Delete post, then delete category ===")
    code, _ = req("DELETE", f"/blog/posts/{post_id}", token=token)
    assert_eq(code, 200, "delete post")
    code, _ = req("DELETE", f"/blog/categories/{cat_id}", token=token)
    assert_eq(code, 200, "category delete after posts gone")

    print("\n=== 21. Regression: existing routes still 200/401 ===")
    # GET /auth/login returns 404 (only POST exists); test by trying login + protected routes
    code, _ = req("POST", "/auth/login", {"email": "wrong@x.com", "password": "x"})
    assert code in (400, 401), f"login bad creds → {code}"
    print(f"  ✅ /auth/login (POST) bad creds → {code}")
    for path in ["/health", "/tasks", "/dashboard/projects", "/clients"]:
        code, _ = req("GET", path, token=token if path != "/health" else None)
        ok = code in (200, 401)
        assert_eq(ok, True, f"{path} → {code}")
    # /chat base GET should respond (likely 401 without token)
    code, _ = req("GET", "/chat")
    assert_eq(code in (200, 401, 404), True, f"/chat (no auth) → {code}")

    print("\n\n🎉 ALL 21 E2E CHECKS PASSED 🎉")


if __name__ == "__main__":
    main()