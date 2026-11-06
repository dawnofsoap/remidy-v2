-- Remidy uses uuidv7() for IDs, which arrived in PostgreSQL 18. Stop here with a clear message
-- on anything older, before any data is created.
DO $$
BEGIN
  IF current_setting('server_version_num')::int < 180000 THEN
    RAISE EXCEPTION 'Remidy needs PostgreSQL 18 or newer. This server runs %.', current_setting('server_version');
  END IF;
END
$$;
