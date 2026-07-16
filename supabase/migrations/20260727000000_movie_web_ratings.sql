-- Web consensus ratings derived from TMDB review text (7-axis TOS schema).
alter table movies_library
  add column if not exists web_ratings jsonb default null;

comment on column movies_library.web_ratings is
  'LLM-derived 7-axis scores from TMDB reviews: acting, screenplay, sound, direction, entertainment, pacing, cinematography, overall, verdict, review_count, analyzed_at, model';
