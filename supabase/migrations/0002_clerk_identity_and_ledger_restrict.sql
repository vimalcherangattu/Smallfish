-- Two corrections, both found by running the schema rather than reading it,
-- plus the login decision.
--
-- ## 1. Identity is Clerk
--
-- `0001` was written against Supabase Auth and said, in as many words, what
-- would change if login moved to Clerk. It moved, so this is that change —
-- and writing it down in advance is the only reason it is four statements
-- rather than an afternoon.
--
-- `account_members.user_id` becomes the Clerk subject (`user_2abc…`), a text
-- id from a system Postgres knows nothing about, so the foreign key to
-- `auth.users` goes. Losing it is a real cost: nothing in the database now
-- guarantees a member row points at a person who exists. That check moves to
-- the webhook that creates the row, which is a weaker place for it, and it is
-- the price of the decision rather than an oversight.
--
-- The policies read `auth.jwt() ->> 'sub'`, which is populated only once Clerk
-- is registered as a third-party auth provider in the Supabase dashboard.
-- Until it is, `member_of` returns false for everyone and every policy denies.
-- That is the correct direction for a misconfiguration to fail in, and it is
-- worth saying out loud, because the opposite arrangement — a policy that
-- passes when the claim is missing — is the failure that has no symptom.
--
-- ## 2. `ledger_entries` cannot cascade, and never could
--
-- `0001` gave `ledger_entries.account_id` an `ON DELETE CASCADE` while a
-- trigger on the same table refuses every DELETE. Deleting an account raised
-- `P0001` from inside the cascade. The schema documented a behaviour it did
-- not have, and only running it showed that — the migration reads perfectly.
--
-- `RESTRICT` states the truth: an account with billing history cannot be
-- deleted. It is closed, with `accounts.closed_at`, which is what that column
-- was for. A deletion request from a customer is answered by closing the
-- account and removing what identifies them, not by destroying the record of
-- what they were charged, which is the one thing a billing dispute needs.

alter table public.account_members drop constraint account_members_user_id_fkey;
alter table public.account_members alter column user_id type text using user_id::text;

create or replace function public.member_of (a uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.account_members m
    where m.account_id = a
      and m.user_id = nullif(auth.jwt() ->> 'sub', '')
  );
$$;

alter table public.ledger_entries drop constraint ledger_entries_account_id_fkey;
alter table public.ledger_entries
  add constraint ledger_entries_account_id_fkey
  foreign key (account_id) references public.accounts (id) on delete restrict;
