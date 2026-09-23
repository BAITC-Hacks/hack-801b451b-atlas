CREATE TABLE IF NOT EXISTS run_lines (
  run_id uuid NOT NULL REFERENCES runs(id),
  sku varchar(48) NOT NULL,
  supplier_id varchar(80) NOT NULL,
  recommended_qty integer NOT NULL CHECK (recommended_qty >= 0),
  final_qty integer NOT NULL CHECK (final_qty >= 0),
  override_reason text,
  CONSTRAINT run_lines_run_sku_uq UNIQUE (run_id, sku)
);
