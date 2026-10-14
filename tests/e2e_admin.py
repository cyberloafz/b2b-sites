"""End-to-end acceptance test for phase 2 (admin editor, publishing, inquiries).

Prerequisites (see README "Testing"):
  - fresh database:          rm -rf .data && npx tsx scripts/db-import.ts demo
  - webhook to the mock:     npx tsx scripts/set-setting.ts demo crmWebhookUrl http://localhost:4555/hook
  - mock email/CRM services: python3 tests/mock-services.py 4555 /tmp/mock-log.jsonl
  - server:                  RESEND_API_KEY=test RESEND_API_URL=http://localhost:4555/emails CRON_SECRET=testcron npx next start -p 3000
Run:  python3 tests/e2e_admin.py /tmp/mock-log.jsonl [screenshot-dir]
"""
import json
import re
import os
import struct
import sys
import time
import urllib.request
import zlib

from playwright.sync_api import expect, sync_playwright

B = "http://localhost:3000"
MOCK_LOG = sys.argv[1]
SHOTS = sys.argv[2] if len(sys.argv) > 2 else None
results = []


def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(("PASS " if cond else "FAIL ") + name + (f"  ({detail})" if detail and not cond else ""))


def shot(page, name):
    if SHOTS:
        page.screenshot(path=os.path.join(SHOTS, name + ".png"))


def png(path, w=640, h=420, rgb=(31, 61, 74)):
    raw = b"".join(b"\x00" + bytes(rgb) * w for _ in range(h))
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))


def mock_events(kind):
    if not os.path.exists(MOCK_LOG):
        return []
    with open(MOCK_LOG) as f:
        return [json.loads(l) for l in f if l.strip() and json.loads(l)["kind"] == kind]


def save_form(page):
    page.locator("form.schema-form button[type=submit]").first.click()
    expect(page.locator(".flash, .form-bar .status").filter(has_text="Saved to draft").first).to_be_visible(timeout=20000)


def api_post(payload, ip):
    req = urllib.request.Request(B + "/api/inquiry", data=json.dumps(payload).encode(), headers={"content-type": "application/json", "x-forwarded-for": ip})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1500, "height": 950}, accept_downloads=True)
    page = ctx.new_page()

    # ---- sign in
    page.goto(B + "/admin")
    page.fill("#email", "owner@example.com")
    page.fill("#password", "wrong-password")
    page.click("button.primary")
    expect(page.get_by_text("Email or password is incorrect")).to_be_visible(timeout=15000)
    check("wrong password is rejected", True)
    check("email is kept after a failed sign-in", page.input_value("#email") == "owner@example.com")
    page.fill("#password", "change-me-now")
    page.click("button.primary")
    page.wait_for_url("**/admin/demo")
    check("owner signs in and lands on the dashboard", page.locator("h1").inner_text() == "Dashboard")
    shot(page, "01-dashboard")

    # ---- edit the home page hero text
    page.goto(B + "/admin/demo/pages")
    page.get_by_role("link", name="Home", exact=True).click()
    page.wait_for_selector(".editor")
    new_headline = "Private label skincare, made to order in the USA"
    page.fill("#f-headline", new_headline)
    save_form(page)
    frame = page.frame_locator("iframe.preview-frame")
    expect(frame.locator("h1")).to_have_text(new_headline, timeout=20000)
    check("hero headline edit shows in the draft preview", True)

    # character limit is enforced with a visible error
    page.fill("#f-headline", "X" * 75)
    page.locator("form.schema-form button[type=submit]").first.click()
    expect(page.locator(".err-box")).to_be_visible(timeout=15000)
    check("over-limit headline is refused with a field error", "70" in page.locator(".err-box").inner_text())
    page.fill("#f-headline", new_headline)
    save_form(page)

    # ---- replace an image: switch hero to split layout and upload a picture
    img_path = "/tmp/e2e-hero.png"
    png(img_path)
    page.select_option("#f-variant", "split")
    page.get_by_role("button", name="+ Add image").click()
    page.locator(".img-fld input[type=file]").set_input_files(img_path)
    page.wait_for_selector(".img-fld img.thumb[src^='/media/demo/']", timeout=20000)
    page.fill("[id='f-image-alt']", "Filled bottles on the production line")
    save_form(page)
    expect(frame.locator(".hero-split img")).to_have_attribute("alt", "Filled bottles on the production line", timeout=20000)
    check("uploaded image appears in the hero preview", True)
    shot(page, "02-editor-hero")

    # ---- add an FAQ question
    page.locator(".blk-list li", has_text="FAQ").locator("button.blk-btn").click()
    page.get_by_role("button", name="+ Add item").click()
    page.locator("[id^='f-groups-0-items-4-question']").fill("Do you ship outside the US?")
    page.locator("[id^='f-groups-0-items-4-answer']").fill("We ship to Canada and Mexico. Other countries on request.")
    save_form(page)
    expect(frame.get_by_text("Do you ship outside the US?")).to_be_visible(timeout=20000)
    check("new FAQ question appears in the preview", True)
    shot(page, "03-editor-faq")

    # ---- add a block with placeholders: publishing is blocked until it is filled
    page.get_by_role("button", name="+ Add block").click()
    page.locator(".add-grid button").filter(has_text=re.compile(r"^Text")).click()
    page.wait_for_selector("#f-body")
    page.goto(B + "/admin/demo/publish")
    blocked = page.locator(".pill.bad").count() > 0 and page.get_by_role("button", name="Publish to live site").is_disabled()
    check("unfilled [[TODO]] placeholders block publishing", blocked)
    check("each placeholder is reported with its page and block", "Page / › block rich-text-" in page.locator(".issues").inner_text(), page.locator(".issues").inner_text()[:200])
    shot(page, "04-publish-blocked")
    page.go_back()
    page.wait_for_selector(".editor")
    check("editor returns to the block being edited", "TODO" in page.locator(".blk-list li.sel").inner_text())
    page.locator(".blk-list li.sel").get_by_role("button", name="Delete").click()
    page.get_by_role("button", name="Confirm delete").click()
    page.wait_for_timeout(1500)

    # ---- live site is unchanged until publish
    live = ctx.new_page()
    live.goto(B + "/")
    check("live site still shows the old headline before publishing", live.locator("h1").inner_text() != new_headline)
    live.wait_for_timeout(800)
    broken = live.evaluate("[...document.images].filter(i => i.complete && i.naturalWidth === 0).map(i => i.src)")
    check("all images on the live home page load", not broken, str(broken[:3]))

    # ---- publish
    page.goto(B + "/admin/demo/publish")
    page.fill("#pub-note", "New hero, FAQ about shipping")
    page.get_by_role("button", name="Publish to live site").click()
    expect(page.get_by_text("Published as version")).to_be_visible(timeout=30000)
    live.goto(B + "/")
    check("published headline is live", live.locator("h1").inner_text() == new_headline)
    check("published FAQ is live", live.get_by_text("Do you ship outside the US?").count() == 1)
    shot(page, "05-published")

    # ---- rename a product: old URL redirects
    page.goto(B + "/admin/demo/products/caffeine-eye-gel")
    page.fill("#f-slug", "caffeine-depuffing-eye-gel")
    page.locator("form.schema-form button[type=submit]").first.click()
    page.wait_for_url("**/products/caffeine-depuffing-eye-gel", timeout=20000)
    page.goto(B + "/admin/demo/publish")
    page.get_by_role("button", name="Publish to live site").click()
    expect(page.get_by_text("Published as version")).to_be_visible(timeout=30000)
    resp = live.goto(B + "/products/private-label-eye-care/caffeine-eye-gel")
    check("renamed product's old URL redirects to the new one", live.url.endswith("/caffeine-depuffing-eye-gel"), live.url)

    # ---- spreadsheet import
    csv = "/tmp/e2e-products.csv"
    with open(csv, "w") as f:
        f.write("Product Name,Category,Description,Features,Sizes,SKU\n")
        f.write('Bakuchiol Night Serum,Serums,"A plant-based retinol alternative serum with bakuchiol and squalane for evening routines, gentle enough for sensitive skin.",Bakuchiol 1%; Squalane,1 oz sample; 1 gal bulk,MB-2001\n')
        f.write('Gentle Gel Cleanser,Facial Cleansers,"An updated description for the gel cleanser that removes makeup and sunscreen without a tight feel, now with green tea.",,,\n')
        f.write('Mystery Item,Candles,"This row uses a category that does not exist, so the import should report it back to the user clearly.",,,\n')
    page.goto(B + "/admin/demo/products/import")
    page.set_input_files("#sheet", csv)
    page.get_by_role("button", name="Read file").click()
    page.wait_for_selector("#map-name")
    check("columns are matched automatically", page.locator("#map-name").input_value() == "0" and page.locator("#map-category").input_value() == "1")
    shot(page, "06-import-mapping")
    page.get_by_role("button", name="Import products").click()
    page.wait_for_selector("text=Import finished", timeout=30000)
    txt = page.locator("section.card").first.inner_text()
    check("import creates, updates and reports failures", "1 created" in txt and "1 updated" in txt and "Candles" in txt, txt[:200])
    shot(page, "07-import-results")

    # ---- inquiries: five forms from an ad click
    live.goto(B + "/?utm_source=google&utm_medium=cpc&utm_campaign=private-label&gclid=TEST-GCLID-123")
    def submit(path, fill):
        live.goto(B + path)
        live.wait_for_timeout(3200)  # forms submitted in under 3 seconds are treated as bots
        fill()
        live.locator("form.inquiry-form button[type=submit]").click()
        live.wait_for_url("**/thank-you", timeout=20000)

    def contact_fields(company=True):
        live.fill("#f-name", "Dana Brooks")
        if company:
            live.fill("#f-company", "Brooks Botanicals")
        live.fill("#f-email", "dana@brooksbotanicals.com")

    submit("/contact?product=shea-body-lotion", lambda: (contact_fields(), live.select_option("#f-service", "Private Label"), live.select_option("#f-quantity", index=3), live.select_option("#f-timeline", index=2)))
    submit("/request-samples", lambda: (contact_fields(False), live.check("input[value='Shea Body Lotion']"), live.fill("#f-street", "12 King St"), live.fill("#f-city", "Charleston"), live.fill("#f-state", "SC"), live.fill("#f-zip", "29401")))
    def project():
        live.select_option("#f-productType", "Body care")
        live.fill("#f-description", "A whipped body butter with a signature citrus scent for our spa clients.")
        live.locator(".step-nav button", has_text="Next").click()
        live.select_option("#f-quantity", index=2); live.select_option("#f-timeline", index=2); live.select_option("#f-budget", index=2)
        live.locator(".step-nav button", has_text="Next").click()
        contact_fields()
    submit("/services/custom-formulation", project)
    check("three website forms submit and reach the thank-you page", True)

    # contact and spec-sheet forms via the API (same payloads the site sends)
    src = {"utm_source": "google", "gclid": "TEST-GCLID-123", "landingPage": "/"}
    s4 = api_post({"inquiry": {"form": "contact", "name": "Lee Park", "email": "lee@parkskin.com", "message": "Do you make SPF products?"}, "source": src, "elapsedMs": 9000}, "10.0.0.2")
    s5 = api_post({"inquiry": {"form": "spec_sheet", "email": "buyer@retailco.com", "company": "RetailCo"}, "source": src, "elapsedMs": 9000}, "10.0.0.2")
    check("contact and spec-sheet inquiries are accepted", s4 == 200 and s5 == 200, f"{s4} {s5}")

    # spam: honeypot filled → stored as spam, nobody notified
    spam = api_post({"inquiry": {"form": "contact", "name": "Bot", "email": "bot@spam.com", "message": "cheap pills cheap pills"}, "website": "http://spam", "elapsedMs": 100}, "10.0.0.3")
    check("bot submission gets a normal answer (learns nothing)", spam == 200)

    # rate limit: 5 per 10 minutes per address
    codes = [api_post({"inquiry": {"form": "contact", "name": "Flood", "email": f"f{i}@x.com", "message": "testing the limit"}, "elapsedMs": 9000}, "10.0.0.9") for i in range(6)]
    check("6th request in 10 minutes is rate-limited", codes[-1] == 429 and codes[:5] == [200] * 5, str(codes))

    time.sleep(3)
    emails = mock_events("email")
    hooks = mock_events("webhook")
    # 3 browser + 2 API + 5 flood = 10 real inquiries; each → 1 team notification + 1 auto-reply, and 1 webhook
    check("team notification + auto-reply sent per real inquiry", len(emails) == 20, f"{len(emails)} emails")
    check("CRM webhook delivered per real inquiry, signed", len(hooks) == 10 and all("X-Signature-Sha256" in h["headers"] or "x-signature-sha256" in h["headers"] for h in hooks), f"{len(hooks)} webhooks")
    gads = [e for e in emails if "Google Ads" in e["body"].get("html", "")]
    check("notification email names the ad channel", len(gads) >= 3, f"{len(gads)}")

    # ---- inbox
    page.goto(B + "/admin/demo/inquiries?channel=ads")
    rows = page.locator("table.list tbody tr").count()
    check("inbox filters inquiries that came from paid ads", rows == 5, f"{rows} rows")
    shot(page, "08-inquiries")
    page.locator("table.list tbody tr").first.locator("a").click()
    page.wait_for_selector("text=Where it came from")
    check("inquiry detail shows the gclid", page.get_by_text("TEST-GCLID-123").count() >= 1)
    shot(page, "09-inquiry-detail")
    page.goto(B + "/admin/demo/inquiries?spam=1")
    check("spam is kept separately", page.locator("table.list tbody tr").count() == 1)
    with page.expect_download() as dl:
        page.goto(B + "/admin/demo/inquiries")
        page.get_by_role("link", name="Export CSV").click()
    data = open(dl.value.path(), encoding="utf-8-sig").read()
    check("CSV export includes every real inquiry", data.count("\n") == 11 and "Google Ads" in data, f"{data.count(chr(10))} lines")

    # ---- theme: unreadable colours are refused
    page.goto(B + "/admin/demo/theme")
    page.locator("[id='f-color-accentInk']").fill("#e9c46a")
    page.locator("form.schema-form button[type=submit]").first.click()
    expect(page.locator(".err-box")).to_be_visible(timeout=15000)
    check("low-contrast theme colours are refused", "contrast" in page.locator(".err-box").inner_text())

    # ---- site-wide announcement bar
    page.goto(B + "/admin/demo/site")
    page.locator("[id='f-messages-1-text']").fill("Now booking Q1 production slots.")
    page.locator("form.schema-form button[type=submit]").first.click()
    expect(page.locator(".form-bar .status").first).to_have_text("Saved to draft", timeout=20000)
    prev = ctx.new_page()
    prev.goto(B + "/preview/demo/about")
    check("announcement change shows on every page in the preview", prev.get_by_text("Now booking Q1 production slots.").count() == 1)
    prev.close()

    # ---- rollback to version 1
    page.goto(B + "/admin/demo/publish")
    page.locator("table.list tbody tr", has_text="Initial import").get_by_role("button", name="Restore").click()
    page.get_by_role("button", name="Restore & publish").click()
    page.wait_for_timeout(4000)
    live.goto(B + "/")
    check("restoring version 1 brings back the original headline", live.locator("h1").inner_text() == "Private label skincare, made in South Carolina")
    shot(page, "10-history")

    # ---- editor is forbidden to anonymous visitors
    anon = browser.new_context().new_page()
    anon.goto(B + "/preview/demo")
    check("draft preview requires sign-in", "/admin/login" in anon.url)
    browser.close()

failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed else 0)
