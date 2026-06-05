-- Add the votes table to the realtime publication so the main stage can
-- recover from dropped VOTE_CAST broadcasts via Postgres CDC. The broadcast
-- channel stays as the fast path; CDC is the at-least-once backstop.
do $$
begin
  alter publication supabase_realtime add table public.votes;
exception
  when duplicate_object then null;
end $$;
