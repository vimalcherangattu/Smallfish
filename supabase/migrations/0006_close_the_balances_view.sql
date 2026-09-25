-- Small Fish · the balances view was readable by anyone, and RLS did not stop it
--
-- **This is a retraction of something 0001 claimed.** That migration's third
-- rule says "No client ever writes to a billing table. RLS grants SELECT to the
-- account's own members and nothing else." The first sentence held. The second
-- did not, and the gap is a view.
--
-- Measured on 2026-09-25 against the production project, as the `anon` role —
-- the role behind the publishable key that ships in the browser bundle:
--
--     set local role anon;
--     select count(*) from public.ledger_entries;   -- 0 rows.   RLS works.
--     select count(*), sum(milli) from public.account_balances;
--                                                   -- 1 row, 2000 milli.
--
-- Same data, same policy, two answers. A view in Postgres runs with the
-- privileges of **its owner**, not of the caller, unless it is created with
-- `security_invoker`. `account_balances` was created by the migration runner,
-- so it summed `ledger_entries` as the owner, for whom RLS does not apply, and
-- then handed the total to whoever asked. The policy on the underlying table
-- was never consulted.
--
-- What leaked is one number per workspace, not names and not a way to spend
-- anything. That is the small part. The large part is that this is precisely
-- the failure the decision log wrote down in advance on 2026-09-24 —
--
--     "a misconfigured joint fails in one of two ways — deny everything, which
--      is visible, or allow everything, which is not"
--
-- — and it still shipped, because the joint that failed was not the one being
-- watched. Writing the failure mode down does not detect it. Only a probe run
-- as the untrusted role does, which is why that probe is now in
-- `stage0/tests/test_rls_live.mjs` rather than in this comment.
--
-- Supabase's own linter had this at ERROR level (`security_definer_view`). It
-- was never read. It is now a launch-checklist item.

-- ------------------------------------------------------- the view itself --

-- Two independent fixes, because either one alone would close this and relying
-- on one of them is how it comes back.
--
--   1. `security_invoker` makes the view evaluate `ledger_entries`' policies as
--      the caller. Anonymous callers now get zero rows, for the same reason
--      they get zero rows from the table.
--   2. The grant is removed from `anon` outright. Even with the invoker flag
--      set, a future policy mistake on `ledger_entries` would flow straight
--      through this view; a role that cannot select the view at all does not
--      depend on that policy being right.
--
-- `authenticated` keeps SELECT, because RLS is now what governs it and a
-- member reading their own balance through the anon key is the design. Server
-- code reads it with the service role and is unaffected.
alter view public.account_balances set (security_invoker = true);

revoke all on public.account_balances from anon;
grant select on public.account_balances to authenticated;

-- --------------------------------------------- writes nobody should have --

-- The billing tables refuse writes today by having no INSERT, UPDATE or DELETE
-- policy, which works. It works *because* of a policy's absence, though, and
-- the grant underneath it is still there — so the day someone adds a policy to
-- fix an unrelated read, the write becomes possible as a side effect.
--
-- Removing the grant makes the refusal structural instead of circumstantial.
-- Nothing in the application writes these tables as `anon` or `authenticated`:
-- every write goes through the service role, which these statements do not
-- touch.
revoke insert, update, delete on public.accounts        from anon, authenticated;
revoke insert, update, delete on public.account_members from anon, authenticated;
revoke insert, update, delete on public.ledger_entries  from anon, authenticated;
revoke insert, update, delete on public.unlocks         from anon, authenticated;
revoke insert, update, delete on public.suppressions    from anon, authenticated;
revoke insert, update, delete on public.events          from anon, authenticated;
revoke all on public.webhook_events from anon, authenticated;

-- ------------------------------------------------------- smaller repairs --

-- `member_of` is a `security definer` function, so Supabase exposes it at
-- `/rest/v1/rpc/member_of` to anyone holding the publishable key. It returns
-- false for an anonymous caller — `auth.jwt() ->> 'sub'` is null — so nothing
-- is disclosed by it today. It is revoked from `anon` anyway, because "this
-- security-definer function happens to be harmless" is a claim that has to be
-- re-checked every time the function changes, and not exposing it is a claim
-- that does not.
--
-- `authenticated` keeps EXECUTE, and must: every policy in 0001 calls this
-- function, and a role that cannot execute it gets an error rather than an
-- empty result. The public read of `suppressions` does not call it, so the
-- opt-out list stays readable without a key. Verified after applying.
--
-- **`from public`, not `from anon`.** The first version of this line revoked
-- from `anon` and changed nothing: Postgres grants EXECUTE on a new function to
-- the `PUBLIC` pseudo-role, and `anon` inherits it from there, so revoking the
-- grant it never held individually is a no-op. The linter still reported the
-- function as anon-callable afterwards, which is the only reason it was
-- caught — `has_function_privilege('anon', …)` still read true.
revoke execute on function public.member_of (uuid) from public, anon;
grant execute on function public.member_of (uuid) to authenticated, service_role;

-- A trigger function with a mutable search_path can be made to resolve its
-- names against a schema the caller controls. This one only ever raises an
-- exception, so there is nothing to hijack — it is pinned because an
-- unexplained warning in the linter is how the explained ones get ignored.
alter function public.ledger_is_append_only () set search_path = public, pg_temp;
