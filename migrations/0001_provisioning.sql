CREATE TABLE IF NOT EXISTS provisioning_records (
  id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  phase TEXT NOT NULL,
  receipts_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
