-- Allow review authors to delete their own rows on movie pages.
create policy "Allow owners to delete reviews"
  on public.reviews
  for delete
  to authenticated
  using (user_id = auth.uid()::text);
