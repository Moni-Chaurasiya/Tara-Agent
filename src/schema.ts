import { query } from "./db";

export async function createSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id                  TEXT PRIMARY KEY,
      date                DATE NOT NULL,
      merchant            TEXT NOT NULL,
      merchant_canonical  TEXT NOT NULL,
      category            TEXT NOT NULL DEFAULT 'uncategorized',
      amount              NUMERIC(14,2) NOT NULL,
      currency            TEXT NOT NULL DEFAULT 'INR',
      memo                TEXT,
      snapshot            TEXT NOT NULL
    )
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_tx_date      ON transactions(date)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_tx_category  ON transactions(category)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_tx_canonical ON transactions(merchant_canonical)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_tx_snapshot  ON transactions(snapshot)`);

  await query(`
    CREATE TABLE IF NOT EXISTS fund_navs (
      fund_id    TEXT NOT NULL,
      fund_name  TEXT NOT NULL,
      category   TEXT NOT NULL,
      nav_date   DATE NOT NULL,
      nav        NUMERIC(14,4) NOT NULL,
      snapshot   TEXT NOT NULL
    )
  `);

  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fund_navs_pkey'
      ) THEN
        ALTER TABLE fund_navs
          ADD CONSTRAINT fund_navs_pkey
          PRIMARY KEY (fund_id, nav_date, snapshot);
      END IF;
    END
    $$
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_nav_fund ON fund_navs(fund_id, nav_date)`);

  await query(`
    CREATE TABLE IF NOT EXISTS holdings (
      fund_id        TEXT NOT NULL,
      fund_name      TEXT NOT NULL,
      units          NUMERIC(14,4) NOT NULL,
      purchase_date  DATE NOT NULL,
      purchase_nav   NUMERIC(14,4) NOT NULL,
      snapshot       TEXT NOT NULL
    )
  `);

  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'holdings_pkey'
      ) THEN
        ALTER TABLE holdings
          ADD CONSTRAINT holdings_pkey
          PRIMARY KEY (fund_id, snapshot);
      END IF;
    END
    $$
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_holdings_fund ON holdings(fund_id, snapshot)`);

  await query(`
    CREATE TABLE IF NOT EXISTS merchant_aliases (
      alias     TEXT NOT NULL,
      canonical TEXT NOT NULL,
      snapshot  TEXT NOT NULL
    )
  `);

  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'merchant_aliases_pkey'
      ) THEN
        ALTER TABLE merchant_aliases
          ADD CONSTRAINT merchant_aliases_pkey
          PRIMARY KEY (alias, snapshot);
      END IF;
    END
    $$
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS async_jobs (
      job_id     TEXT PRIMARY KEY,
      status     TEXT NOT NULL DEFAULT 'running',
      question   TEXT NOT NULL,
      result     TEXT,
      error      TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  console.log("Schema ready");
}