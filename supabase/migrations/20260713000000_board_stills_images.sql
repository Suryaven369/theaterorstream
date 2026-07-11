-- Allow cinematic stills + uploaded images on movie boards
-- still  = TMDB backdrop/still tied to a title
-- image  = user-uploaded image (moodboard scrap)

ALTER TABLE public.board_items
  DROP CONSTRAINT IF EXISTS board_items_item_type_check;

ALTER TABLE public.board_items
  ADD CONSTRAINT board_items_item_type_check
  CHECK (item_type IN ('movie', 'tv', 'director', 'actor', 'still', 'image'));
