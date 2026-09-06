ALTER TABLE field_snapshots
  ADD COLUMN encoding_version SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN status_data BYTEA;

UPDATE field_snapshots AS snapshot
SET status_data = COALESCE(
  (
    SELECT decode(
      string_agg(
        CASE snapshot.payload->'rows'->>row_number::TEXT
          WHEN 'green' THEN '00'
          WHEN 'yellow' THEN '01'
          WHEN 'red' THEN '02'
          ELSE 'ff'
        END,
        '' ORDER BY row_number
      ),
      'hex'
    )
    FROM generate_series(
      1,
      GREATEST(COALESCE((snapshot.payload->>'currentRow')::INTEGER - 1, 0), 0)
    ) AS row_number
  ),
  decode('', 'hex')
);

ALTER TABLE field_snapshots
  ALTER COLUMN status_data SET NOT NULL,
  DROP COLUMN payload;

ALTER TABLE field_snapshots
  ADD CONSTRAINT field_snapshots_encoding_version_check
  CHECK (encoding_version = 1);

COMMENT ON COLUMN field_snapshots.status_data IS
  'Encoding v1: one byte per row; 0=Good, 1=Fast, 2=Slow, 255=unset.';
