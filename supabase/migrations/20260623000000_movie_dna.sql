-- Movie DNA: rich weighted traits per movie (mind_bending, slow_burn,
-- character_driven, plot_twist, ...) beyond genres, plus the user's aggregated
-- "Taste DNA" derived from the DNA of films they love.

ALTER TABLE public.movies_library
  ADD COLUMN IF NOT EXISTS movie_dna jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS dna_computed_at timestamptz;

COMMENT ON COLUMN public.movies_library.movie_dna IS
  'Weighted DNA traits 0-100, e.g. {"mind_bending":95,"slow_burn":70}. LLM-tagged.';

-- Backfill worker scans rows that are active and not yet tagged.
CREATE INDEX IF NOT EXISTS idx_movies_library_dna_pending
  ON public.movies_library (popularity DESC NULLS LAST)
  WHERE dna_computed_at IS NULL AND is_active = true;

ALTER TABLE public.user_taste_profiles
  ADD COLUMN IF NOT EXISTS dna_preferences jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.user_taste_profiles.dna_preferences IS
  'Aggregated Taste DNA 0-100 from the movie_dna of highly-engaged titles.';
