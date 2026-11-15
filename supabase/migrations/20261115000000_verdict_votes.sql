-- Landing page "Theater / Wait for OTT / Skip" poll.
-- verdict_votes: one vote per visitor (hashed device or user id) per title.
-- verdict_vote_totals: public running totals; browsers subscribe to it via
-- Realtime so results update live without a reload.

CREATE TABLE IF NOT EXISTS public.verdict_votes (
  tmdb_id text NOT NULL,
  voter_key text NOT NULL,          -- sha256 of the device id / user id (never the raw id)
  ip_key text,                      -- sha256 of the IP, for abuse limits only
  choice text NOT NULL CHECK (choice IN ('theater', 'ott', 'skip')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tmdb_id, voter_key)
);

CREATE INDEX IF NOT EXISTS idx_verdict_votes_ip ON public.verdict_votes (tmdb_id, ip_key);

-- Written only by the API (service role); no public access to raw votes.
ALTER TABLE public.verdict_votes ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.verdict_vote_totals (
  tmdb_id text PRIMARY KEY,
  theater integer NOT NULL DEFAULT 0,
  ott integer NOT NULL DEFAULT 0,
  skip integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.verdict_vote_totals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read verdict totals" ON public.verdict_vote_totals;
CREATE POLICY "Public read verdict totals" ON public.verdict_vote_totals
  FOR SELECT TO anon, authenticated
  USING (true);

-- Keep totals in sync with votes (insert / change of mind / delete).
CREATE OR REPLACE FUNCTION public.sync_verdict_vote_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    INSERT INTO public.verdict_vote_totals (tmdb_id) VALUES (OLD.tmdb_id)
      ON CONFLICT (tmdb_id) DO NOTHING;
    UPDATE public.verdict_vote_totals SET
      theater = theater - (OLD.choice = 'theater')::int,
      ott = ott - (OLD.choice = 'ott')::int,
      skip = skip - (OLD.choice = 'skip')::int,
      updated_at = now()
    WHERE tmdb_id = OLD.tmdb_id;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    INSERT INTO public.verdict_vote_totals (tmdb_id) VALUES (NEW.tmdb_id)
      ON CONFLICT (tmdb_id) DO NOTHING;
    UPDATE public.verdict_vote_totals SET
      theater = theater + (NEW.choice = 'theater')::int,
      ott = ott + (NEW.choice = 'ott')::int,
      skip = skip + (NEW.choice = 'skip')::int,
      updated_at = now()
    WHERE tmdb_id = NEW.tmdb_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS verdict_votes_sync_totals ON public.verdict_votes;
CREATE TRIGGER verdict_votes_sync_totals
  AFTER INSERT OR UPDATE OF choice OR DELETE ON public.verdict_votes
  FOR EACH ROW EXECUTE FUNCTION public.sync_verdict_vote_totals();

-- Live updates for the landing page.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'verdict_vote_totals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.verdict_vote_totals;
  END IF;
END $$;
