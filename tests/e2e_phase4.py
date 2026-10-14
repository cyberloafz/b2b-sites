"""End-to-end checks for phase 4 (AI one-click generation) with the mock model.
Server setup as tests/e2e_admin.py, started with AI_MOCK_FAIL="block:faq@/faq" so one job fails once
and the Retry path is exercised. Run:  python3 tests/e2e_phase4.py
"""
import json
import re
import subprocess
import sys
import urllib.request

from playwright.sync_api import expect, sync_playwright

B = "http://localhost:3000"
HOST = "prairie-pantry.localhost"
FIX = "tests/fixtures/"
results = []


def check(name, cond, detail=""):
    results.append(bool(cond))
    print(("PASS " if cond else "FAIL ") + name + (f"  ({detail})" if detail and not cond else ""))


def get(path, host=HOST):
    req = urllib.request.Request(B + path, headers={"x-forwarded-host": host})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


qn = json.load(open(FIX + "prairie-questionnaire.json"))

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1400, "height": 950})
    page = ctx.new_page()
    page.goto(B + "/admin/login")
    page.fill("#email", "owner@example.com")
    page.fill("#password", "change-me-now")
    page.click("button.primary")
    page.wait_for_url("**/admin/demo")

    # ---- 1. questionnaire
    page.get_by_role("link", name="+ New site with AI").click()
    page.wait_for_url("**/admin/new")
    check("demo-mode notice shown without an API key", page.get_by_text("Demo mode.").is_visible())
    # A first submit with a bad ZIP keeps what was typed and points at the field.
    page.fill("#brandName", qn["brandName"])
    page.fill("#zip", "ABC")
    page.get_by_role("button", name="Plan my site").click()
    expect(page.get_by_text("Please fix the highlighted fields.")).to_be_visible()
    check("validation error shown next to the field", page.locator("#zip-err").is_visible())
    check("typed values kept after an error", page.input_value("#brandName") == qn["brandName"])

    for k in ["legalName", "brandName", "websiteUrl", "street", "city", "state", "zip", "phone", "email", "inquiryEmail",
              "industry", "whatYouMake", "audience", "minimumOrder", "leadTime", "capacity"]:
        page.fill(f"#{k}", str(qn[k]))
    page.fill("#foundedYear", str(qn["foundedYear"]))
    for i, s in enumerate(qn["services"]):
        page.fill(f"#service{i}Name", s["name"])
        page.fill(f"#service{i}Desc", s["description"])
    page.fill("#certifications", "\n".join(qn["certifications"]))
    page.fill("#differentiators", "\n".join(qn["differentiators"]))
    page.fill("#keywords", ", ".join(qn["keywords"]))
    page.set_input_files("#logo", FIX + "prairie-logo.svg")
    page.set_input_files("#sheet", FIX + "prairie-products.csv")
    page.get_by_role("button", name="Plan my site").click()
    page.wait_for_url("**/admin/new/prairie-pantry/plan", timeout=60000)

    # ---- 2. plan review
    body = page.inner_text("main")
    check("plan lists a page per service", "/services/private-label" in body and "/services/contract-manufacturing" in body)
    check("categories come from the spreadsheet", all(c in body for c in ["Sauces & Marinades", "Dry Rubs & Seasonings", "Pickles & Relishes"]))
    check("style picked from industry", 'Style "natural-organic"' in body, body[:300])
    check("brand colour taken from the logo", "taken from the logo" in body)
    check("product columns guessed", page.locator("#map_category").input_value() != "" and page.locator("#map_description").input_value() != "")
    check("required pages cannot be unticked", page.get_by_label("Keep Contact").is_disabled())
    page.get_by_label("Keep How It Works").uncheck()
    page.get_by_label("Service for Pickles & Relishes").select_option("contract-manufacturing")
    page.get_by_role("button", name="Generate the site").click()
    page.wait_for_url("**/progress")

    # ---- 3. progress, failure and retry
    expect(page.get_by_role("heading", name=re.compile("ready to review"))).to_be_visible(timeout=90000)
    check("failed step listed with Retry", page.get_by_role("button", name="Retry").count() == 1)
    check("failed block left as placeholder that blocks publishing", "placeholders to fill" in page.inner_text("main") and "pages[/faq].faq" in page.inner_text("main"))
    page.get_by_role("button", name="Retry").click()
    expect(page.get_by_role("button", name="Retry")).to_have_count(0, timeout=30000)
    txt = page.inner_text("main")
    check("retry writes the block; no placeholders left", "pages[/faq].faq" not in txt, txt[:600])
    check("9 products imported from the sheet", re.search(r"9\s*products imported", txt) is not None, txt[:600])
    page.screenshot(path="/tmp/claude-0/-home-claude/18be8f74-c0cc-53f4-8216-62df5f66558f/scratchpad/p4-progress.png", full_page=True)

    # The editor opens normally once generation is done.
    page.goto(B + "/admin/prairie-pantry/pages")
    check("generated site opens in the page editor", page.get_by_role("link", name="Home").count() > 0)
    check("dropped page was not created", "/how-it-works" not in page.inner_text("main"))

    # ---- 4. publish (SEO check runs on the draft first)
    page.goto(B + "/admin/prairie-pantry/publish")
    txt = page.inner_text("main")
    check("sample legal text blocks publishing", "This is sample legal text" in txt and page.get_by_role("button", name="Publish to live site").is_disabled())
    page.get_by_label("I confirm these pages were reviewed and are accurate for our company.").check()
    page.get_by_role("button", name="Confirm and remove the sample notice").click()
    expect(page.get_by_text(re.compile("Confirmed as reviewed by"))).to_be_visible(timeout=30000)
    check("legal confirmation recorded with name and date", "Confirmed as reviewed by Site Owner" in page.inner_text("main"))
    page.get_by_role("button", name="Publish to live site").click()
    expect(page.get_by_text("Published as version")).to_be_visible(timeout=120000)
    check("generated site passes validation + SEO check and publishes", True)

    # ---- 5. the live site on its staging host
    s, html = get("/")
    check("home page live on staging host", s == 200 and "Prairie Pantry" in html, str(s))
    check("exactly one H1 on home", len(re.findall(r"<h1[\s>]", html)) == 1)
    check("logo from upload in header", "/media/prairie-pantry/logo-" in html)
    check("no placeholders on the live site", "[[TODO" not in html)
    s, html = get("/privacy")
    check("confirmed legal page has no sample notice", s == 200 and "Sample text generated" not in html and "What we collect" in html, str(s))
    s, html = get("/products/pickles-relishes")
    check("category page lists its products", s == 200 and "Spicy Dill Spears" in html and "Sweet Corn Relish" in html, str(s))
    s, html = get("/products/sauces-marinades/smoky-chipotle-bbq-sauce")
    check("product page from the sheet", s == 200 and "chipotle pepper and molasses" in html, str(s))
    s, html = get("/services/contract-manufacturing")
    check("category moved to another service in the plan shows on that service page", s == 200 and "Spicy Dill Spears" in html, str(s))
    s, _ = get("/how-it-works")
    check("unticked page is not on the site", s == 404, str(s))
    s, html = get("/sitemap.xml")
    check("sitemap includes category and product pages", "/products/dry-rubs-seasonings" in html and "/products/pickles-relishes/spicy-dill-spears" in html)
    check("demo site unaffected on its own host", "Meridian Bay" in get("/", host="localhost")[1])

    p2 = ctx.new_page()
    p2.goto(f"http://{HOST}:3000/")
    p2.screenshot(path="/tmp/claude-0/-home-claude/18be8f74-c0cc-53f4-8216-62df5f66558f/scratchpad/p4-home.png", full_page=True)
    p2.goto(f"http://{HOST}:3000/products/sauces-marinades")
    p2.screenshot(path="/tmp/claude-0/-home-claude/18be8f74-c0cc-53f4-8216-62df5f66558f/scratchpad/p4-category.png", full_page=True)
    page.goto(B + "/admin/new/prairie-pantry/plan")
    browser.close()

audit = subprocess.run(["node", "scripts/seo-audit.mjs", B, "--host", HOST], capture_output=True, text=True)
print(audit.stdout.strip().splitlines()[0] if audit.stdout else audit.stderr[:500])
check("live SEO audit of the generated site passes", audit.returncode == 0, audit.stdout[-1500:])

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
