import { sql } from "./db";

// ───────────────────────────────────────────────────────────────
// Self-initialising schema.
//
// ensureSchema() runs CREATE TABLE / CREATE INDEX IF NOT EXISTS so the
// database sets itself up on first use — no separate migration step is
// required. It is memoised so it only runs once per warm instance.
//
// The UNIQUE indexes are the hard guarantee against duplicate keywords.
// COALESCE(...,'') + lower() means duplicates are caught case-insensitively
// even when optional grouping columns (campaign / ad group / category) are
// blank.
// ───────────────────────────────────────────────────────────────

async function migrate() {
  await sql`
    CREATE TABLE IF NOT EXISTS keywords (
      id           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      list_type    TEXT NOT NULL DEFAULT 'b2b',
      campaign     TEXT NOT NULL DEFAULT '',
      ad_group     TEXT NOT NULL DEFAULT '',
      keyword      TEXT NOT NULL,
      match_type   TEXT NOT NULL DEFAULT 'broad',
      intent_cluster TEXT NOT NULL DEFAULT '',
      priority     TEXT NOT NULL DEFAULT '',
      notes        TEXT NOT NULL DEFAULT '',
      status       TEXT NOT NULL DEFAULT 'active',
      created_by   TEXT NOT NULL DEFAULT '',
      created_role TEXT NOT NULL DEFAULT '',
      updated_by   TEXT NOT NULL DEFAULT '',
      updated_role TEXT NOT NULL DEFAULT '',
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS keywords_dedup
    ON keywords (
      list_type,
      lower(keyword),
      match_type,
      lower(campaign),
      lower(ad_group)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS negative_keywords (
      id           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      category     TEXT NOT NULL DEFAULT '',
      keyword      TEXT NOT NULL,
      match_type   TEXT NOT NULL DEFAULT 'broad',
      notes        TEXT NOT NULL DEFAULT '',
      status       TEXT NOT NULL DEFAULT 'active',
      created_by   TEXT NOT NULL DEFAULT '',
      created_role TEXT NOT NULL DEFAULT '',
      updated_by   TEXT NOT NULL DEFAULT '',
      updated_role TEXT NOT NULL DEFAULT '',
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS negatives_dedup
    ON negative_keywords (
      lower(keyword),
      match_type,
      lower(category)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS geo_locations (
      id           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      tier         TEXT NOT NULL DEFAULT 'tier1_gta',
      location     TEXT NOT NULL,
      notes        TEXT NOT NULL DEFAULT '',
      created_by   TEXT NOT NULL DEFAULT '',
      created_role TEXT NOT NULL DEFAULT '',
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS geo_dedup
    ON geo_locations (tier, lower(location))
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS seeds (
      id           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      seed_term    TEXT NOT NULL DEFAULT '',
      seed_url     TEXT NOT NULL DEFAULT '',
      source_site  TEXT NOT NULL DEFAULT '',
      notes        TEXT NOT NULL DEFAULT '',
      created_by   TEXT NOT NULL DEFAULT '',
      created_role TEXT NOT NULL DEFAULT '',
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS seeds_dedup
    ON seeds (lower(seed_term), lower(seed_url))
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS activity_log (
      id           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      actor_name   TEXT NOT NULL DEFAULT '',
      actor_role   TEXT NOT NULL DEFAULT '',
      action       TEXT NOT NULL,
      entity_type  TEXT NOT NULL DEFAULT '',
      entity_id    INT,
      keyword_text TEXT NOT NULL DEFAULT '',
      details      JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS activity_created_idx
    ON activity_log (created_at DESC)
  `;

  // Google Ads "Suggestion Metrics" section — fully isolated from the rest.
  await sql`
    CREATE TABLE IF NOT EXISTS sem_uploads (
      id            INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      label         TEXT NOT NULL DEFAULT '',
      period_start  TEXT NOT NULL DEFAULT '',
      period_end    TEXT NOT NULL DEFAULT '',
      file_count    INT NOT NULL DEFAULT 0,
      health_score  INT NOT NULL DEFAULT 0,
      uploaded_by   TEXT NOT NULL DEFAULT '',
      uploaded_role TEXT NOT NULL DEFAULT '',
      report        JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS sem_created_idx
    ON sem_uploads (created_at DESC)
  `;
}

export function ensureSchema(): Promise<void> {
  if (!global.__schemaReady) {
    global.__schemaReady = migrate().catch((err) => {
      // Reset so a later request can retry after a transient failure.
      global.__schemaReady = undefined;
      throw err;
    });
  }
  return global.__schemaReady;
}
