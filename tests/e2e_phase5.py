"""End-to-end checks for phase 5 (accounts, Google sign-in, R2 storage, custom domains, cron, hardening).

Needs the two local mocks and the server started with the settings in tests/phase5.env:
    python3 tests/mock-services.py 4555 .data/mock-log.jsonl &      # email API
    node tests/mock-cloud.mjs 4557 &                                 # DNS, Vercel, Google, R2
    rm -rf .data/pglite && npm run db:import
    npm run build && env $(cat tests/phase5.env | xargs) npm start &
    python3 tests/e2e_phase5.py .data/mock-log.jsonl
"""
import json
import re
import struct
import sys
import time
import urllib.request
import zlib

from playwright.sync_api import expect, sync_playwright

B = "http://localhost:3000"
M = "http://127.0.0.1:4557"
LOG = sys.argv[1] if len(sys.argv) > 1 else ".data/mock-log.jsonl"
DOMAIN = "www.meridian-test.com"
results = []


def check(name, cond, detail=""):
    results.append(bool(cond))
    print(("PASS " if cond else "FAIL ") + name + (f"  ({detail})" if detail and not cond else ""))


def http(url, headers=None, method="GET", data=None):
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *a, **k):
            return None
    req = urllib.request.Request(url, headers=headers or {}, method=method, data=data)
    try:
        with urllib.request.build_opener(NoRedirect).open(req) as r:
            return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()


def site(path, host):
    return http(B + path, {"x-forwarded-host": host})


def mock(path, body):
    return http(M + path, {"content-type": "application/json"}, "POST", json.dumps(body).encode())


def emails_to(addr):
    out = []
    for line in open(LOG):
        e = json.loads(line)
        if e["kind"] == "email" and addr in e["body"].get("to", []):
            out.append(e["body"])
    return out


def link_in(mail, kind):
    m = re.search(r'href="(http://localhost:3000/admin/' + kind + r'/[A-Za-z0-9_-]+)"', mail["html"])
    return m.group(1) if m else None


def png(path, w=1200, h=800):
    raw = (b"\x00" + bytes(x % 256 for x in range(w * 3))) * h
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    open(path, "wb").write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))


def login(ctx, email, pw):
    page = ctx.new_page()
    page.goto(B + "/admin/login")
    page.fill("#email", email)
    page.fill("#password", pw)
    page.click("button.primary")
    return page


# ---- platform basics
mock("/_reset", {})
s, h, body = http(B + "/api/health")
health = json.loads(body)
check("health check answers with the configured services", s == 200 and health["ok"] and health["storage"] == "s3" and health["domains"] == "vercel", str(health))
s, h, _ = http(B + "/", {"x-forwarded-host": "localhost"})
hl = {k.lower(): v for k, v in h.items()}
check("security headers on the public site", hl.get("x-content-type-options") == "nosniff" and hl.get("x-frame-options") == "SAMEORIGIN" and "referrer-policy" in hl, str(hl))
s, h, _ = http(B + "/admin/login")
check("admin pages are marked noindex", "noindex" in {k.lower(): v for k, v in h.items()}.get("x-robots-tag", ""))
s, _, _ = http(B + "/api/cron/deliver")
check("cron endpoint refuses calls without the secret", s == 401)

with sync_playwright() as p:
    browser = p.chromium.launch()
    owner_ctx = browser.new_context(viewport={"width": 1400, "height": 950})
    page = login(owner_ctx, "owner@example.com", "change-me-now")
    page.wait_for_url("**/admin/demo")

    # ---- invitations and roles
    page.goto(B + "/admin/demo/team")
    page.fill("#inv-email", "Ed@Example.com")
    page.select_option("#inv-role", "editor")
    page.get_by_role("button", name="Send invitation").click()
    expect(page.get_by_text("Invitation sent to ed@example.com.")).to_be_visible()
    check("pending invitation listed", "ed@example.com" in page.inner_text("main"))
    mails = emails_to("ed@example.com")
    invite = link_in(mails[-1], "invite") if mails else None
    check("invitation email sent with a one-time link", invite is not None and "invited you" in mails[-1]["subject"], str(mails[-1:])[:300])

    ed_ctx = browser.new_context()
    ed = ed_ctx.new_page()
    ed.goto(invite)
    check("invitation page names the site and role", "Join Meridian Bay" in ed.inner_text("main") and "an editor" in ed.inner_text("main"))
    ed.fill("#name", "Ed Editor")
    ed.fill("#password", "short")
    ed.get_by_role("button", name="Create account and join").click()
    expect(ed.get_by_text("Use at least 10 characters.")).to_be_visible()
    check("weak password refused", True)
    ed.fill("#password", "editor-pass-2026")
    ed.get_by_role("button", name="Create account and join").click()
    ed.wait_for_url("**/admin/demo")
    nav = ed.locator("nav[aria-label=Admin]").inner_text()
    check("editor joins the site; owner-only menus hidden", "Pages" in nav and "Team" not in nav and "Domains" not in nav, nav)
    ed.goto(B + "/admin/demo/team")
    check("editor cannot open the team page", "denied=1" in ed.url)
    ed.goto(invite)
    check("invitation link works only once", "Invitation not valid" in ed.inner_text("main"))

    page.goto(B + "/admin/demo/team")
    check("new member listed as editor", "Ed Editor" in page.inner_text("main"))
    page.get_by_label("Role for Site Owner").select_option("editor")
    expect(page.get_by_text("A site needs at least one owner")).to_be_visible()
    check("the last owner cannot be demoted", True)

    # ---- password reset
    ed.goto(B + "/admin/forgot")
    ed.fill("#email", "ed@example.com")
    ed.get_by_role("button", name="Send reset link").click()
    expect(ed.get_by_text("If an account exists")).to_be_visible()
    ed.fill("#email", "nobody@example.com")
    ed.get_by_role("button", name="Send reset link").click()
    time.sleep(1)
    check("unknown address gets the same answer and no email", not emails_to("nobody@example.com"))
    reset = link_in(emails_to("ed@example.com")[-1], "reset")
    check("reset email sent", reset is not None)
    other = login(browser.new_context(), "ed@example.com", "editor-pass-2026")
    other.wait_for_url("**/admin/demo")  # a second session that the reset must end
    ed.goto(reset)
    ed.fill("#password", "new-editor-pass-1")
    ed.fill("#confirm", "different-pass-123")
    ed.get_by_role("button", name="Save new password").click()
    expect(ed.get_by_text("The two passwords do not match.")).to_be_visible()
    ed.fill("#password", "new-editor-pass-1")
    ed.fill("#confirm", "new-editor-pass-1")
    ed.get_by_role("button", name="Save new password").click()
    expect(ed.get_by_text("Your password was changed")).to_be_visible()
    check("password reset signs the user in", True)
    other.goto(B + "/admin/demo")
    check("reset signs out other sessions", "/admin/login" in other.url)
    bad = login(browser.new_context(), "ed@example.com", "editor-pass-2026")
    expect(bad.get_by_text("Email or password is incorrect.")).to_be_visible()
    check("old password no longer works", True)
    good = login(browser.new_context(), "ed@example.com", "new-editor-pass-1")
    good.wait_for_url("**/admin/demo")
    check("new password works", True)
    ed.goto(reset)
    check("reset link works only once", "expired or was already used" in ed.inner_text("main"))

    # ---- self sign-up (ALLOW_SIGNUP=true)
    su = browser.new_context().new_page()
    su.goto(B + "/admin/signup")
    su.fill("#name", "New Customer")
    su.fill("#email", "new@example.com")
    su.fill("#password", "customer-pass-99")
    su.get_by_role("button", name="Create account").click()
    su.wait_for_url("**/admin/new")
    check("sign-up leads straight to the AI site wizard", True)

    # ---- Google sign-in (mock OpenID provider)
    mock("/_oidc", {"sub": "google-owner", "email": "owner@example.com", "name": "Owner"})
    g = browser.new_context().new_page()
    g.goto(B + "/admin/login")
    g.get_by_role("link", name="Continue with Google").click()
    g.wait_for_url("**/admin/demo")
    check("Google sign-in links to the existing account with the same verified email", True)
    g.goto(B + "/admin/account")
    check("account page shows Google as linked", "Linked" in g.inner_text("main"))
    mock("/_oidc", {"sub": "google-stranger", "email": "stranger@example.com", "name": "Stranger"})
    g2 = browser.new_context().new_page()
    g2.goto(B + "/admin/login")
    g2.get_by_role("link", name="Continue with Google").click()
    g2.wait_for_url("**/admin")
    check("Google sign-up creates an account when sign-up is open", "No sites yet" in g2.inner_text("main"))
    s, h, _ = http(B + "/api/auth/google/callback?code=x&state=forged")
    check("callback with a forged state is refused", s in (302, 303, 307) and "expired" in urllib.request.unquote(h.get("location", h.get("Location", ""))))

    # ---- uploads go to R2 (mock S3) and are served from its public address
    png("/tmp/e2e-p5.png")
    page.goto(B + "/admin/demo/media")
    page.set_input_files("#up-file", "/tmp/e2e-p5.png")
    page.fill("#up-alt", "Test image for storage")
    page.get_by_role("button", name="Upload").click()
    page.wait_for_selector(f"img[src^='{M}/bucket/demo/']", timeout=30000)
    src = page.locator(f"img[src^='{M}/bucket/demo/']").first.get_attribute("src")
    objs = json.loads(http(M + "/_log")[2])["objects"]
    key = src.split("/bucket/")[1]
    check("upload stored in the bucket with a signed request", key in objs and any(o.endswith("-480.webp") for o in objs), str(objs))
    s, h, body = http(src)
    check("image served from the storage address", s == 200 and body[:4] == b"\x89PNG")

    # ---- custom domain
    page.goto(B + "/admin/demo/domains")
    page.fill("#hostname", "shop.localhost")
    page.get_by_role("button", name="Add domain").click()
    expect(page.get_by_text("assigned by the platform")).to_be_visible()
    check("platform addresses cannot be claimed", True)
    page.fill("#hostname", "https://WWW.Meridian-Test.com/about")
    page.get_by_role("button", name="Add domain").click()
    expect(page.get_by_text(f"Added {DOMAIN}.")).to_be_visible()
    check("domain normalised and added", True)
    token = page.locator("table.dns tr", has_text="TXT").locator("code").nth(1).inner_text()
    check("DNS instructions show the ownership token", re.fullmatch(r"[0-9a-f]{32}", token) is not None, token)
    s, _, _ = site("/", DOMAIN)
    check("an unverified domain is not served", s == 404, str(s))
    row = page.locator("tr", has_text=DOMAIN).first
    row.get_by_role("button", name="Check now").click()
    expect(page.get_by_text("TXT record _site-verify.www.meridian-test.com not found yet")).to_be_visible()
    check("check reports the missing TXT record", True)
    mock("/_dns", {"name": f"_site-verify.{DOMAIN}", "type": "TXT", "data": token})
    mock("/_dns", {"name": DOMAIN, "type": "CNAME", "data": "sites.test-platform.com"})
    page.locator("tr", has_text=DOMAIN).first.get_by_role("button", name="Check now").click()
    expect(page.locator("tr", has_text=DOMAIN).first.get_by_text("Issuing certificate")).to_be_visible()
    check("verified domain sent to the SSL provider", any(e["path"].endswith("/domains") and e["method"] == "POST" for e in json.loads(http(M + "/_log")[2])["log"]))
    page.locator("tr", has_text=DOMAIN).first.get_by_role("button", name="Check now").click()
    expect(page.locator("tr", has_text=DOMAIN).first.get_by_text("Ready")).to_be_visible()
    check("domain becomes Ready once the certificate is issued", True)
    s, _, body = site("/", DOMAIN)
    check("verified domain serves the site", s == 200 and b"Meridian Bay" in body, str(s))
    check("Caddy may issue a certificate for the verified domain only",
          http(B + f"/api/domains/allowed?domain={DOMAIN}")[0] == 200 and http(B + "/api/domains/allowed?domain=evil.example.com")[0] == 404)
    page.locator("tr", has_text=DOMAIN).first.get_by_role("button", name="Make main address").click()
    expect(page.get_by_text(f"Main address: https://{DOMAIN}")).to_be_visible()
    s, h, _ = site("/products?gclid=abc123&utm_source=google", "localhost")
    loc = h.get("location", h.get("Location", ""))
    check("other addresses redirect to the main domain, keeping the ad click id", s == 308 and loc == f"https://{DOMAIN}/products?gclid=abc123&utm_source=google", f"{s} {loc}")
    s, _, body = site("/about", DOMAIN)
    check("canonical URLs use the main domain without republishing", f'href="https://{DOMAIN}/about"'.encode() in body)
    s, _, body = site("/sitemap.xml", DOMAIN)
    check("sitemap uses the main domain", f"<loc>https://{DOMAIN}/</loc>".encode() in body or f"<loc>https://{DOMAIN}</loc>".encode() in body, body[:300])

    # ---- background work runs from the cron endpoint
    s, _, body = http(B + "/api/cron/deliver", {"authorization": "Bearer testcron"})
    out = json.loads(body)
    check("cron runs deliveries, domain checks and queued jobs", s == 200 and {"emails", "domains", "jobs"} <= set(out), str(out))

    # ---- password guessing is throttled (separate client IP so the rest of the test is unaffected)
    t_ctx = browser.new_context(extra_http_headers={"x-forwarded-for": "10.9.9.9"})
    for i in range(8):
        tp = login(t_ctx, "nobody@example.com", f"wrong-{i}")
        expect(tp.get_by_text("Email or password is incorrect.")).to_be_visible()
        tp.close()
    tp = login(t_ctx, "owner@example.com", "change-me-now")
    expect(tp.get_by_text("Too many failed attempts")).to_be_visible()
    check("after 8 failures from one address, sign-in is paused for 15 minutes", True)
    browser.close()

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
