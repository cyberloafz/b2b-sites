"""End-to-end checks for phase 3 (SEO check before publish, responsive images, 404 log, redirects).
Same setup as tests/e2e_admin.py (fresh database, server on :3000). Run:  python3 tests/e2e_phase3.py
"""
import struct
import sys
import urllib.request
import zlib

from playwright.sync_api import expect, sync_playwright

B = "http://localhost:3000"
results = []


def check(name, cond, detail=""):
    results.append(bool(cond))
    print(("PASS " if cond else "FAIL ") + name + (f"  ({detail})" if detail and not cond else ""))


def png(path, w=2000, h=1200):
    # one gradient row repeated (so the WebP output is not trivially tiny)
    rows = b"".join(b"\x00" + b"".join(bytes((x * 255 // w, 90, 140)) for x in range(w)) for _ in range(1))
    raw = rows * h
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))


def status(path):
    req = urllib.request.Request(B + path, method="GET")
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *a, **k):
            return None
    opener = urllib.request.build_opener(NoRedirect)
    try:
        with opener.open(req) as r:
            return r.status, r.headers.get("location")
    except urllib.error.HTTPError as e:
        return e.code, e.headers.get("location")


def publish(page, expect_ok=True):
    page.goto(B + "/admin/demo/publish")
    page.get_by_role("button", name="Publish to live site").click()
    if expect_ok:
        expect(page.get_by_text("Published as version")).to_be_visible(timeout=90000)
    else:
        expect(page.get_by_text("Not published")).to_be_visible(timeout=90000)


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1500, "height": 950})
    page = ctx.new_page()
    page.goto(B + "/admin/login")
    page.fill("#email", "owner@example.com")
    page.fill("#password", "change-me-now")
    page.click("button.primary")
    page.wait_for_url("**/admin/demo")

    # ---- SEO check on a clean draft
    page.goto(B + "/admin/demo/publish")
    page.get_by_role("button", name="Run check now").click()
    expect(page.locator("[role=status]", has_text="errors")).to_be_visible(timeout=90000)
    page.wait_for_timeout(1500)
    page.reload()
    check("SEO check crawls the draft and finds no errors", page.get_by_text("No errors").count() == 1, page.locator("main").inner_text()[:300])

    # ---- a broken link blocks publishing and points to the block
    page.goto(B + "/admin/demo/pages")
    page.get_by_role("link", name="Home", exact=True).click()
    page.wait_for_selector(".editor")
    page.locator(".blk-list li", has_text="Call to action").locator("button.blk-btn").click()
    page.locator("[id='f-primary-href']").fill("/catalog-2019")
    page.locator("form.schema-form button[type=submit]").first.click()
    expect(page.locator(".flash", has_text="Saved")).to_be_visible(timeout=20000)
    publish(page, expect_ok=False)
    page.wait_for_timeout(1500)
    page.reload()
    txt = page.locator("main").inner_text()
    check("broken link found by the SEO check blocks publishing", "Broken link to /catalog-2019" in txt, txt[:400])
    fix = page.get_by_role("link", name="Fix in block cta").first
    check("the problem links straight to the block to fix", fix.count() == 1)
    fix.click()
    page.wait_for_selector("[id='f-primary-href']")
    check("the fix link opens that block in the editor", page.locator("[id='f-primary-href']").input_value() == "/catalog-2019")
    page.locator("[id='f-primary-href']").fill("/contact")
    page.locator("form.schema-form button[type=submit]").first.click()
    expect(page.locator(".flash", has_text="Saved")).to_be_visible(timeout=20000)

    # ---- responsive images
    png("/tmp/e2e-wide.png")
    page.locator(".blk-list li", has_text="Image + text").locator("button.blk-btn").click()
    page.locator(".img-fld input[type=file]").set_input_files("/tmp/e2e-wide.png")
    page.wait_for_selector(".img-fld img.thumb[src^='/media/demo/']", timeout=30000)
    page.locator("[id='f-image-alt']").fill("Wide production floor photo")
    page.locator("form.schema-form button[type=submit]").first.click()
    expect(page.locator(".flash", has_text="Saved")).to_be_visible(timeout=20000)
    publish(page)
    live = ctx.new_page()
    live.goto(B + "/")
    img = live.locator("img[alt='Wide production floor photo']")
    srcset = img.get_attribute("srcset") or ""
    check("uploaded image is served with a WebP srcset (480/960/1600/full)", all(s in srcset for s in ["-480.webp 480w", "-960.webp 960w", "-1600.webp 1600w", "-full.webp 2000w"]), srcset)
    first = srcset.split(" ")[0]
    st, _ = status(first)
    check("WebP variants load", st == 200, f"{first} {st}")
    live.set_viewport_size({"width": 400, "height": 800})
    live.reload()
    live.locator("img[alt='Wide production floor photo']").scroll_into_view_if_needed()
    live.wait_for_timeout(800)
    cur = live.evaluate("document.querySelector(\"img[alt='Wide production floor photo']\").currentSrc")
    check("phones download a small variant, not the original", ".webp" in cur and "-full" not in cur, cur)

    # ---- 404 log → redirect
    for _ in range(3):
        status("/old-catalog")
    page.goto(B + "/admin/demo/redirects")
    row = page.locator("table.list tbody tr", has_text="/old-catalog")
    check("missing page is logged with its visit count", row.count() == 1 and "3" in row.inner_text(), row.inner_text() if row.count() else "")
    row.locator("input").fill("/products")
    row.get_by_role("button", name="Redirect").click()
    page.wait_for_timeout(1500)
    st, loc = status("/old-catalog")
    check("visiting the old address now redirects permanently", st == 308 and loc and loc.endswith("/products"), f"{st} {loc}")
    check("redirected address leaves the 404 list", page.locator("table.list tbody tr", has_text="/old-catalog").locator("button", has_text="Redirect").count() == 0)

    # ---- loops are refused
    page.fill("input[placeholder='/old-page']", "/a")
    page.locator("input[placeholder='/products']").last.fill("/b")
    page.get_by_role("button", name="Add redirect").click()
    page.wait_for_timeout(1000)
    page.fill("input[placeholder='/old-page']", "/b")
    page.locator("input[placeholder='/products']").last.fill("/a")
    page.get_by_role("button", name="Add redirect").click()
    expect(page.get_by_text("redirect loop")).to_be_visible(timeout=10000)
    check("redirect loops are refused", True)
    browser.close()

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
