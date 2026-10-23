DO $$
BEGIN
  IF EXISTS (
    SELECT date FROM blocked_dates WHERE dentist_id IS NULL GROUP BY date HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate clinic-wide closure dates exist. Review and resolve them before applying this migration.';
  END IF;
END $$;

CREATE UNIQUE INDEX blocked_dates_clinic_date_key ON blocked_dates (date) WHERE dentist_id IS NULL;
