"""End-to-end checks for the platform admin (/platform) and first-run setup.

Runs against real PostgreSQL (the production database path), starting from an EMPTY database:
    DATABASE_URL=postgres://…/sites  (fresh, no tables)  npm start &
    python3 tests/e2e_platform.py
The test imports the demo site itself (scripts/db-import.ts) after the first admin is created.
"""
import os
import re
import subprocess
import sys
import urllib.request

from playwright.sync_api import expect, sync_playwright

B = "http://localhost:3000"
results = []


def check(name, cond, detail=""):
    results.append(bool(cond))
    print(("PASS " if cond else "FAIL ") + name + (f"  ({detail})" if detail and not cond else ""))


def status(path, host="localhost"):
    req = urllib.request.Request(B + path, headers={"x-forwarded-host": host})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code


def login(ctx, email, pw):
    page = ctx.new_page()
    page.goto(B + "/admin/login")
    page.fill("#email", email)
    page.fill("#password", pw)
    page.click("button.primary")
    return page


def confirm(page, label, confirm_label):
    page.get_by_role("button", name=label, exact=True).first.click()
    page.get_by_role("button", name=confirm_label).click()


with sync_playwright() as p:
    browser = p.chromium.launch()
    boss_ctx = browser.new_context(viewport={"width": 1400, "height": 950})
    boss = boss_ctx.new_page()

    # ---- first run: an empty platform asks for its first admin
    boss.goto(B + "/admin/login")
    boss.wait_for_url("**/admin/setup")
    check("fresh deployment opens the setup page", "Set up your platform" in boss.inner_text("main"))
    boss.fill("#name", "Pat Platform")
    boss.fill("#email", "boss@platform.test")
    boss.fill("#password", "short")
    boss.get_by_role("button", name="Create admin account").click()
    expect(boss.get_by_text("Use at least 10 characters.")).to_be_visible()
    boss.fill("#password", "launch-day-2026-ok")
    boss.get_by_role("button", name="Create admin account").click()
    boss.wait_for_url("**/platform")
    check("first account becomes platform admin and lands on the overview", "Platform overview" in boss.inner_text("main"))
    other = browser.new_context().new_page()
    other.goto(B + "/admin/setup")
    check("setup closes once an account exists", "/admin/login" in other.url)

    # ---- a customer site appears (demo import = a customer who built a site)
    r = subprocess.run(["npx", "tsx", "scripts/db-import.ts", "demo"], capture_output=True, text=True, env=os.environ)
    check("demo customer site imported into Postgres", r.returncode == 0, r.stderr[-400:])

    boss.goto(B + "/platform/sites")
    check("all sites listed with owner and status", "Meridian Bay" in boss.inner_text("main") and "owner@example.com" in boss.inner_text("main"))
    boss.fill("input[name=q]", "OWNER@example")
    boss.get_by_role("button", name="Filter").click()
    check("search by owner email finds the site", "Meridian Bay" in boss.inner_text("main"))
    boss.goto(B + "/platform/sites?status=suspended")
    check("status filter works", "No sites match." in boss.inner_text("main"))

    boss.goto(B + "/platform")
    t = boss.inner_text("main")
    check("overview counts sites and users", re.search(r"1\s*sites", t) and re.search(r"2\s*users", t), t[:400])
    check("nothing needs attention on a healthy platform", "all clear" in t)

    # ---- non-admins cannot see the platform admin
    owner_ctx = browser.new_context()
    owner = login(owner_ctx, "owner@example.com", "change-me-now")
    owner.wait_for_url("**/admin/demo")
    owner.goto(B + "/platform")
    check("customers cannot open the platform admin", "denied=1" in owner.url)
    check("customers see no platform link", "Platform admin" not in owner.inner_text("body"))

    # ---- site detail, support access
    boss.goto(B + "/platform/sites/demo")
    t = boss.inner_text("main")
    check("site detail shows team, domains and publishes", "owner@example.com" in t and "localhost" in t and "Initial import" in t)
    boss.goto(B + "/admin/demo")
    check("without support access the operator cannot edit the site", "denied=1" in boss.url)
    boss.goto(B + "/platform/sites/demo")
    confirm(boss, "Get support access", "Join as owner (customer will see you in Team)")
    expect(boss.get_by_role("link", name="Open site admin")).to_be_visible()
    boss.get_by_role("link", name="Open site admin").click()
    boss.wait_for_url("**/admin/demo")
    check("support access opens the customer's site admin", "Dashboard" in boss.inner_text("nav"))
    owner.goto(B + "/admin/demo/team")
    check("customer sees the support person on the Team page", "boss@platform.test" in owner.inner_text("main"))
    boss.goto(B + "/platform/sites/demo")
    confirm(boss, "End support access", "Leave this site's team")
    expect(boss.get_by_role("button", name="Get support access")).to_be_visible()
    boss.goto(B + "/admin/demo")
    check("ending support access removes it", "denied=1" in boss.url)

    # ---- suspend / resume
    check("live site is online", status("/") == 200)
    boss.goto(B + "/platform/sites/demo")
    boss.get_by_role("button", name="Suspend site").click()
    boss.get_by_role("button", name="Take the site offline").click()
    expect(boss.get_by_text("Give a reason")).to_be_visible()
    boss.fill("#suspend-reason", "Unpaid invoice #1001")
    boss.get_by_role("button", name="Take the site offline").click()
    expect(boss.get_by_text("Offline. Reason: Unpaid invoice #1001")).to_be_visible()
    check("suspended site is offline for visitors", status("/") == 404 and status("/products") == 404)
    owner.goto(B + "/admin/demo/publish")
    owner.get_by_role("button", name="Publish to live site").click()
    expect(owner.get_by_text("Published as version")).to_be_visible(timeout=90000)
    check("publishing does not bring a suspended site back", status("/") == 404)
    confirm(boss, "Resume site", "Put the site back online")
    expect(boss.get_by_role("button", name="Suspend site")).to_be_visible()
    check("resumed site is online again", status("/") == 200)

    # ---- users: disable / enable, platform admin rights
    boss.goto(B + "/platform/users")
    row = boss.locator("tr", has_text="owner@example.com")
    row.get_by_role("button", name="Disable").click()
    boss.get_by_role("button", name="Disable and sign out owner@example.com").click()
    expect(boss.locator("tr", has_text="owner@example.com").get_by_text(re.compile("^disabled"))).to_be_visible()
    owner.goto(B + "/admin/demo")
    check("disabling signs the user out at once", "/admin/login" in owner.url)
    again = login(browser.new_context(), "owner@example.com", "change-me-now")
    expect(again.get_by_text("This account is disabled. Contact support.")).to_be_visible()
    check("disabled user cannot sign in", True)
    check("a disabled customer's live site stays online", status("/") == 200)
    boss.locator("tr", has_text="owner@example.com").get_by_role("button", name="Enable").click()
    boss.get_by_role("button", name="Enable owner@example.com").click()
    expect(boss.locator("tr", has_text="owner@example.com").get_by_role("button", name="Disable")).to_be_visible()
    owner = login(owner_ctx, "owner@example.com", "change-me-now")
    owner.wait_for_url("**/admin/demo")
    check("re-enabled user can sign in", True)
    check("operator cannot disable or demote themselves", boss.locator("tr", has_text="boss@platform.test").get_by_role("button").count() == 0)
    boss.locator("tr", has_text="owner@example.com").get_by_role("button", name="Make admin").click()
    boss.get_by_role("button", name="Give full platform access").click()
    expect(boss.locator("tr", has_text="owner@example.com").get_by_text("platform admin")).to_be_visible()
    owner.goto(B + "/platform")
    check("a new platform admin can open the platform admin", "Platform overview" in owner.inner_text("main"))
    boss.locator("tr", has_text="owner@example.com").get_by_role("button", name="Remove admin").click()
    boss.get_by_role("button", name="Remove platform admin").click()
    expect(boss.locator("tr", has_text="owner@example.com").get_by_role("button", name="Make admin")).to_be_visible()
    owner.goto(B + "/platform")
    check("removing the right takes effect immediately", "denied=1" in owner.url)

    # ---- audit log
    boss.goto(B + "/platform/audit")
    t = boss.inner_text("main")
    for label in ["Got support access to", "Ended support access to", "Suspended site", "Resumed site", "Disabled user", "Enabled user", "Made platform admin", "Removed platform admin"]:
        check(f"audit log records: {label}", label in t)
    check("audit log keeps the suspension reason", "reason: Unpaid invoice #1001" in t)
    boss.goto(B + "/platform")
    boss.screenshot(path=os.environ.get("SHOT_DIR", "/tmp") + "/platform-overview.png", full_page=True)
    boss.goto(B + "/platform/sites/demo")
    boss.screenshot(path=os.environ.get("SHOT_DIR", "/tmp") + "/platform-site.png", full_page=True)
    browser.close()

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
