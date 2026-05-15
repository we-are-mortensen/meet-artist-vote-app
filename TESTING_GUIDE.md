# Testing Guide — Artist Vote

How to verify the gamified flow works end-to-end. There is no automated test suite for this project — verification is `npx tsc --noEmit` + `npm run build` + manual dev-server smoke testing.

---

## Prerequisites

- Node.js, dependencies installed (`npm install`).
- Supabase project with the migration applied and `participants` seeded (see `README.md` → "Database setup").
- For Google Meet testing: the add-on registered, HTTPS deployment, multiple Google accounts.

---

## Local smoke test

Most of the flow can be exercised against a local dev server without Google Meet, by opening the routes directly in two browser windows.

### Start the server

```bash
NEXT_PUBLIC_DEBUG=1 npm run dev
```

Server listens at `https://localhost:3000`. Accept the self-signed cert.

### Confirm DB state

In Supabase Studio:

- `participants` has rows. Note the UUIDs of two of them (e.g. "Pau" and "Adri").
- `polls`, `votes`, `score_events` exist as tables and are empty.
- `participants` is in the `supabase_realtime` publication:
  ```sql
  select tablename from pg_publication_tables
   where pubname = 'supabase_realtime' and tablename = 'participants';
  ```

### Drive a round

In **window A** (host):
1. Open `https://localhost:3000/sidepanel`.
2. Expect the dropdown populated from `participants`. Pick someone who is **not** you (e.g. "Pau"). Click **Començar votació**.
3. Redirects to `/activitysidepanel`. The identity picker should appear.
4. Pick yourself (e.g. "Adri"). The vote UI appears with all participants listed.
5. In Supabase Studio, confirm a row exists in `polls` with `status='voting'` and the right `correct_participant_id`.

In **window B** (voter):
1. Open `https://localhost:3000/activitysidepanel`.
2. Identity picker. Pick a different participant (e.g. "Edwin").
3. Vote for "Pau" (the correct answer).
4. Confirm a row appears in `votes` with `voter_participant_id` = Edwin and `voted_for_id` = Pau.

In **window A** (host, post-vote):
1. Vote for someone. Confirmation appears.
2. Click **Revelar resultats**.
   - Both windows lock voting.
   - `polls.status` flips to `'revealed'`.
   - If you open `/mainstage` in a third window, it now shows the `ResultsView` with the artist hero card and the correct-guesser highlight.
3. Click **Mostrar puntuació**.
   - `score_poll` runs.
   - `polls.status` → `'scored'`.
   - `score_events` gains the appropriate rows.
   - `participants.points` for correct guessers (e.g. Edwin if they guessed Pau) goes up.
   - Main stage transitions to the leaderboard with the `+N` badge animation.
   - Every connected client's `IdentityHeader` updates its points number live via Postgres Changes.

### Identity persistence

Reload window B without clearing storage. Expect: no identity picker, header shows the previously chosen name + current points.

Click **Canviar** in the header. Expect: identity cleared, picker reappears.

---

## Scoring rule verification

Run these in the Supabase SQL editor to confirm `score_poll` behaves as designed. Each block sets up a synthetic round, scores it, asserts the result, and cleans up.

### Case: nobody guesses → artist +3

```sql
do $$
declare a uuid; b uuid; c uuid;
begin
  select id into a from public.participants where name = 'Pau';
  select id into b from public.participants where name = 'Adri';
  select id into c from public.participants where name = 'Edwin';

  insert into public.polls (id, correct_participant_id, status)
    values ('poll_test_nobody', a, 'revealed');
  insert into public.votes (poll_id, voter_participant_id, voted_for_id, timestamp) values
    ('poll_test_nobody', b, c, 0),
    ('poll_test_nobody', c, b, 0);
end $$;

select public.score_poll('poll_test_nobody');

-- Expected: Pau gained 3, Adri/Edwin unchanged.
select name, points from public.participants where name in ('Pau','Adri','Edwin') order by name;
```

### Case: everyone guesses → each non-artist +1, artist +0

```sql
do $$
declare a uuid; b uuid; c uuid;
begin
  select id into a from public.participants where name = 'Pau';
  select id into b from public.participants where name = 'Adri';
  select id into c from public.participants where name = 'Edwin';

  insert into public.polls (id, correct_participant_id, status)
    values ('poll_test_all', a, 'revealed');
  insert into public.votes (poll_id, voter_participant_id, voted_for_id, timestamp) values
    ('poll_test_all', b, a, 0),
    ('poll_test_all', c, a, 0);
end $$;

select public.score_poll('poll_test_all');

-- Expected: Adri +1, Edwin +1, Pau unchanged.
```

### Case: mixed → artist gets (total − correct), correct guessers each +3

```sql
do $$
declare a uuid; b uuid; c uuid; d uuid;
begin
  select id into a from public.participants where name = 'Pau';
  select id into b from public.participants where name = 'Adri';
  select id into c from public.participants where name = 'Edwin';
  select id into d from public.participants where name = 'Nika';

  insert into public.polls (id, correct_participant_id, status)
    values ('poll_test_mixed', a, 'revealed');
  -- 1 correct, 2 wrong
  insert into public.votes (poll_id, voter_participant_id, voted_for_id, timestamp) values
    ('poll_test_mixed', b, a, 0),  -- correct
    ('poll_test_mixed', c, d, 0),  -- wrong
    ('poll_test_mixed', d, c, 0);  -- wrong
end $$;

select public.score_poll('poll_test_mixed');

-- Expected: Pau +2 (total 3 − correct 1), Adri +3 (correct), Edwin/Nika unchanged.
```

### Idempotency

Run `select public.score_poll('poll_test_mixed');` a second time. Points must not change — the function bails out at the `FOR UPDATE` guard.

### Cleanup

```sql
delete from public.score_events where poll_id like 'poll_test_%';
delete from public.votes        where poll_id like 'poll_test_%';
delete from public.polls        where id     like 'poll_test_%';
update public.participants set points = 0;
```

---

## Google Meet integration test

Local tests cover everything except the actual Meet SDK wrapping. Once the local flow works:

1. Build and deploy to your HTTPS host (GitHub Pages or similar).
2. Start a Meet call with multiple accounts.
3. Have the host share the deployed URL via screenshare. Meet should prompt to open the add-on.
4. Repeat the flow from "Drive a round" above using the Meet-embedded add-on instead of direct URLs.

The host must not pick themselves as the artist — the artist screen has no controls.

---

## Things to verify by eye

**Visual:**
- IdentityHeader shows correct name, live points, "Canviar" link.
- Results view shows the artist hero card and the "Qui ho ha encertat:" highlight (or "Ningú ho ha encertat 🙈" when applicable).
- Leaderboard rows are sorted by points desc, with `+N` badges animating in only for participants who gained points this round.
- Dark mode (system-level) renders cleanly across all three views.

**Behavioral:**
- Late-joining main stage (open `/mainstage` after the host has revealed) lands directly on the results view.
- Late-joining main stage after scoring lands directly on the leaderboard.
- Non-host who has not voted, after reveal, sees the "results on main screen" banner (not disabled radio options).
- Re-voting in the activity panel before reveal updates the existing row (no duplicates in `votes`).

---

## Common issues

**Identity picker doesn't list anyone.** `participants` table is empty or the realtime publication isn't enabled. Re-run the verification queries from `README.md`.

**Main stage stuck on "voting" after host reveals.** Realtime channel didn't subscribe. Check the browser console for Supabase connection errors. Verify env vars.

**Leaderboard points don't update live.** Postgres Changes subscription failed. Confirm `participants` is in the `supabase_realtime` publication. Check console.

**Host buttons missing.** `sessionStorage.hostOfPollId !== pollState.pollId`. Either the host opened the activity panel in a tab that didn't initiate the activity, or the page was reloaded after sessionStorage was cleared. Restart the activity from `/sidepanel`.

**Host can't drive the flow.** Host picked themselves as the artist. Restart with a different artist.

---

## What's intentionally not tested here

- Identity collisions (two clients claiming the same participant): allowed by design, last vote wins.
- Voting after reveal: blocked client-side; if you bypass the UI, the scoring RPC will still produce a correct result based on the snapshot of votes at scoring time.
- Concurrent host scoring clicks: idempotent server-side.
