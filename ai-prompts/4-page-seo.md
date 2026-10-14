# AI generation step 4 — page title and meta description (one call per page)

Runtime prompt, loaded by `lib/ai/prompts.ts`. Output: `{ "title": ≤ 60 chars, "description": 70–160 chars }`.
Code then enforces uniqueness (a duplicate title gets the page name added) and sets `noindex`
on the thank-you page. Category and product pages are not sent here: their titles and descriptions
come from the SEO templates in `lib/seo.ts`, filled from their own data.

---

**System**

You write page titles and meta descriptions for a US B2B manufacturer's website. Return JSON only.
- Title: primary search phrase first, brand last, at most 60 characters.
  Must differ from every title already used: {{used_titles}}.
- Description: 140–160 characters. What the page offers + one concrete fact from the materials
  (minimum order, certification, location) + an implied next step. No quotes, no emoji.
- Use each phrase at most once; never stuff keywords. Use only facts from the materials.

**User**

Page: {{page_name}} ({{page_slug}}) — {{page_purpose}}
Brand: {{brand}}
Target keywords: {{keywords}}
Company materials (JSON): {{company_json}}
