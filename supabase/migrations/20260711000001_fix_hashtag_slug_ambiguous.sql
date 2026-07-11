-- Fix: PL/pgSQL variable "slug" conflicted with hashtags.slug column
-- (error: column reference "slug" is ambiguous) when posting with #tags.

CREATE OR REPLACE FUNCTION public.sync_content_hashtags(
  p_content text,
  p_content_type text,
  p_content_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_ids uuid[];
  token text;
  v_slug text;
  tag_id uuid;
  new_ids uuid[] := '{}';
BEGIN
  SELECT coalesce(array_agg(hashtag_id), '{}') INTO old_ids
  FROM public.content_hashtags
  WHERE content_type = p_content_type AND content_id = p_content_id;

  DELETE FROM public.content_hashtags
  WHERE content_type = p_content_type AND content_id = p_content_id;

  FOR token IN SELECT unnest(public.extract_hashtag_tokens(p_content))
  LOOP
    v_slug := public.normalize_hashtag_slug(token);
    IF v_slug IS NULL OR length(v_slug) < 2 THEN CONTINUE; END IF;

    INSERT INTO public.hashtags AS h (slug, display_name)
    VALUES (v_slug, token)
    ON CONFLICT (slug) DO UPDATE SET updated_at = now()
    RETURNING h.id INTO tag_id;

    INSERT INTO public.content_hashtags (hashtag_id, content_type, content_id, user_id)
    VALUES (tag_id, p_content_type, p_content_id, p_user_id)
    ON CONFLICT DO NOTHING;

    new_ids := array_append(new_ids, tag_id);
  END LOOP;

  PERFORM public.refresh_hashtag_counts(hid)
  FROM unnest(old_ids || new_ids) AS hid;
END;
$$;
