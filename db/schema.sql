-- Platform schema (PostgreSQL 15+; also runs on PGlite for local development).
-- Every content table carries site_id: one database, many customer sites.
-- Content columns are JSONB validated by the zod schemas in /schema before every write.

CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());

-- ---------- tenants ----------
CREATE TABLE IF NOT EXISTS sites (
  id            text PRIMARY KEY,                 -- short slug, e.g. 'demo'
  name          text NOT NULL,
  status        text NOT NULL DEFAULT 'draft',    -- draft | live | suspended
  company       jsonb NOT NULL,                   -- CompanySchema
  theme         jsonb NOT NULL,                   -- ThemeSchema
  services      jsonb NOT NULL,                   -- ServiceSchema[]
  globals       jsonb NOT NULL,                   -- announcement / header / footer blocks
  templates     jsonb NOT NULL,                   -- category & product page layouts
  default_ctas  jsonb NOT NULL,
  settings      jsonb NOT NULL DEFAULT '{}',      -- crm webhook url, ai crawler switch, etc.
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS domains (
  hostname    text PRIMARY KEY,                   -- lower-case, no port
  site_id     text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  is_primary  boolean NOT NULL DEFAULT false,
  ssl_status  text NOT NULL DEFAULT 'pending'
);
CREATE INDEX IF NOT EXISTS domains_site ON domains(site_id);

-- ---------- draft content (what the editor changes) ----------
CREATE TABLE IF NOT EXISTS pages (
  id        serial PRIMARY KEY,
  site_id   text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  slug      text NOT NULL,
  template  text NOT NULL,
  name      text NOT NULL,
  seo       jsonb NOT NULL DEFAULT '{}',
  position  int  NOT NULL DEFAULT 0,
  UNIQUE (site_id, slug)
);

CREATE TABLE IF NOT EXISTS sections (
  id        serial PRIMARY KEY,
  page_id   int  NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  block_id  text NOT NULL,                        -- stable id used for anchors and AI jobs
  type      text NOT NULL,
  position  int  NOT NULL,
  visible   boolean NOT NULL DEFAULT true,
  data      jsonb NOT NULL,                       -- the full block, validated by BlockSchema
  UNIQUE (page_id, block_id)
);
CREATE INDEX IF NOT EXISTS sections_page ON sections(page_id, position);

CREATE TABLE IF NOT EXISTS collections (
  id        serial PRIMARY KEY,
  site_id   text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  slug      text NOT NULL,
  position  int  NOT NULL DEFAULT 0,
  data      jsonb NOT NULL,                       -- CollectionSchema
  UNIQUE (site_id, slug)
);

CREATE TABLE IF NOT EXISTS products (
  id          serial PRIMARY KEY,
  site_id     text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  slug        text NOT NULL,
  collection  text NOT NULL,
  position    int  NOT NULL DEFAULT 0,
  data        jsonb NOT NULL,                     -- ProductSchema (packaging sizes live inside)
  UNIQUE (site_id, slug)
);
CREATE INDEX IF NOT EXISTS products_collection ON products(site_id, collection);

CREATE TABLE IF NOT EXISTS media (
  id          text PRIMARY KEY,                   -- random id, also the file name stem
  site_id     text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  url         text NOT NULL,
  filename    text NOT NULL,
  mime        text NOT NULL,
  bytes       int  NOT NULL,
  width       int,
  height      int,
  alt         text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS media_site ON media(site_id, created_at DESC);

CREATE TABLE IF NOT EXISTS redirects (
  site_id    text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  from_path  text NOT NULL,
  to_path    text NOT NULL,
  code       int  NOT NULL DEFAULT 301,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, from_path)
);

-- ---------- publishing ----------
-- Every publish stores the whole assembled site (validated). Public pages render only from the
-- latest published version, so a half-finished edit can never reach visitors.
CREATE TABLE IF NOT EXISTS site_versions (
  id          serial PRIMARY KEY,
  site_id     text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  snapshot    jsonb NOT NULL,
  note        text NOT NULL DEFAULT '',
  author      text NOT NULL,
  kind        text NOT NULL DEFAULT 'publish',    -- publish | restore | import
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS site_versions_site ON site_versions(site_id, id DESC);

-- ---------- inquiries ----------
CREATE TABLE IF NOT EXISTS inquiries (
  id                 serial PRIMARY KEY,
  site_id            text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  form               text NOT NULL,
  fields             jsonb NOT NULL,
  source             jsonb NOT NULL DEFAULT '{}',
  marketing_consent  boolean NOT NULL DEFAULT false,
  status             text NOT NULL DEFAULT 'new',  -- new | following_up | quoted | won | invalid
  spam               boolean NOT NULL DEFAULT false,
  ip_hash            text,
  received_at        timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inquiries_site ON inquiries(site_id, received_at DESC);
CREATE INDEX IF NOT EXISTS inquiries_ip ON inquiries(site_id, ip_hash, received_at DESC);

CREATE TABLE IF NOT EXISTS email_outbox (
  id          serial PRIMARY KEY,
  site_id     text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  inquiry_id  int REFERENCES inquiries(id) ON DELETE SET NULL,
  kind        text NOT NULL,                       -- notify | autoreply
  to_addr     text NOT NULL,
  reply_to    text,
  subject     text NOT NULL,
  html        text NOT NULL,
  status      text NOT NULL DEFAULT 'queued',      -- queued | sent | failed | skipped
  attempts    int  NOT NULL DEFAULT 0,
  last_error  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  sent_at     timestamptz
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id               serial PRIMARY KEY,
  site_id          text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  inquiry_id       int REFERENCES inquiries(id) ON DELETE CASCADE,
  url              text NOT NULL,
  status           text NOT NULL DEFAULT 'pending', -- pending | delivered | failed
  attempts         int  NOT NULL DEFAULT 0,
  last_error       text,
  next_attempt_at  timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS webhook_due ON webhook_deliveries(status, next_attempt_at);

-- ---------- accounts (minimal; replace with the phase 0 account system) ----------
CREATE TABLE IF NOT EXISTS users (
  id             serial PRIMARY KEY,
  email          text NOT NULL UNIQUE,
  name           text NOT NULL,
  password_hash  text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memberships (
  user_id  int  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_id  text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  role     text NOT NULL,                           -- owner | editor
  PRIMARY KEY (user_id, site_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash  text PRIMARY KEY,
  user_id     int  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------- AI generation (phase 4) ----------
CREATE TABLE IF NOT EXISTS ai_jobs (
  id          serial PRIMARY KEY,
  site_id     text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  step        text NOT NULL,
  target      text,
  input       jsonb NOT NULL DEFAULT '{}',
  output      jsonb,
  status      text NOT NULL DEFAULT 'queued',
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS ai_jobs_site ON ai_jobs(site_id, id);

-- One row per AI-generated site: what the company told us, the confirmed plan, and progress.
CREATE TABLE IF NOT EXISTS site_generations (
  site_id       text PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
  questionnaire jsonb NOT NULL,
  logo          jsonb,                              -- {src,width,height,color} or null
  sheet         jsonb,                              -- {headers, rows, mapping} or null
  brand_note    text,
  plan          jsonb,
  status        text NOT NULL DEFAULT 'planning',   -- planning | plan_ready | generating | done | failed
  error         text,
  summary       jsonb,                              -- counts and open TODOs after generation
  provider      text,
  created_by    int REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------- SEO (phase 3) ----------
CREATE TABLE IF NOT EXISTS seo_reports (
  id          serial PRIMARY KEY,
  site_id     text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  errors      int  NOT NULL,
  warnings    int  NOT NULL,
  pages       int  NOT NULL,
  report      jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS seo_reports_site ON seo_reports(site_id, id DESC);

CREATE TABLE IF NOT EXISTS not_found_log (
  site_id    text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  path       text NOT NULL,
  hits       int  NOT NULL DEFAULT 1,
  referrer   text,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, path)
);

ALTER TABLE media ADD COLUMN IF NOT EXISTS variants jsonb NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS sitemap_submissions (
  id          serial PRIMARY KEY,
  site_id     text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  status      text NOT NULL,
  detail      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------- Accounts (phase 5) ----------
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;     -- accounts that only sign in with Google
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub text UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at timestamptz;
ALTER TABLE email_outbox ALTER COLUMN site_id DROP NOT NULL;     -- account emails belong to no site

CREATE TABLE IF NOT EXISTS invitations (
  id           serial PRIMARY KEY,
  site_id      text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  email        text NOT NULL,
  role         text NOT NULL,                        -- owner | editor
  token_hash   text NOT NULL UNIQUE,
  invited_by   int REFERENCES users(id) ON DELETE SET NULL,
  expires_at   timestamptz NOT NULL,
  accepted_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invitations_site ON invitations(site_id);

CREATE TABLE IF NOT EXISTS password_resets (
  token_hash  text PRIMARY KEY,
  user_id     int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Failed sign-ins, for throttling password guessing (by email and by hashed IP).
CREATE TABLE IF NOT EXISTS login_failures (
  key   text NOT NULL,
  at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_failures_key ON login_failures(key, at);

-- ---------- Custom domains (phase 5) ----------
ALTER TABLE domains ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'custom';   -- staging | custom
ALTER TABLE domains ADD COLUMN IF NOT EXISTS verify_token text;                    -- TXT value proving ownership
ALTER TABLE domains ADD COLUMN IF NOT EXISTS verified_at timestamptz;              -- only verified hosts are served
ALTER TABLE domains ADD COLUMN IF NOT EXISTS dns_ok boolean NOT NULL DEFAULT false; -- CNAME/A points at the platform
ALTER TABLE domains ADD COLUMN IF NOT EXISTS provider_ref text;                    -- id at the SSL provider
ALTER TABLE domains ADD COLUMN IF NOT EXISTS last_check_at timestamptz;
ALTER TABLE domains ADD COLUMN IF NOT EXISTS last_error text;
ALTER TABLE domains ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
-- Hosts added by the platform itself (imports, staging addresses) need no ownership proof.
UPDATE domains SET verified_at = now(), dns_ok = true WHERE verified_at IS NULL AND verify_token IS NULL;

-- ---------- Background jobs (phase 5) ----------
-- Durable queue: a job survives server restarts. A crashed run is retried once its lease expires.
CREATE TABLE IF NOT EXISTS jobs (
  id            serial PRIMARY KEY,
  kind          text NOT NULL,                       -- generate-site
  payload       jsonb NOT NULL DEFAULT '{}',
  status        text NOT NULL DEFAULT 'queued',      -- queued | running | done | failed
  attempts      int  NOT NULL DEFAULT 0,
  max_attempts  int  NOT NULL DEFAULT 3,
  run_after     timestamptz NOT NULL DEFAULT now(),
  locked_until  timestamptz,
  last_error    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz
);
CREATE INDEX IF NOT EXISTS jobs_due ON jobs(status, run_after);

-- ---------- Platform administration (phase 6) ----------
ALTER TABLE users ADD COLUMN IF NOT EXISTS platform_admin boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled_at timestamptz;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS suspended_reason text;
ALTER TABLE ai_jobs ADD COLUMN IF NOT EXISTS input_tokens int NOT NULL DEFAULT 0;
ALTER TABLE ai_jobs ADD COLUMN IF NOT EXISTS output_tokens int NOT NULL DEFAULT 0;
ALTER TABLE ai_jobs ADD COLUMN IF NOT EXISTS model text;

CREATE TABLE IF NOT EXISTS platform_audit (
  id         serial PRIMARY KEY,
  actor_id   int REFERENCES users(id) ON DELETE SET NULL,
  actor      text NOT NULL,                       -- email at the time, kept if the user is deleted
  action     text NOT NULL,                       -- site.suspend | site.resume | support.join | user.disable …
  target     text NOT NULL,
  detail     jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_audit_time ON platform_audit(created_at DESC);
