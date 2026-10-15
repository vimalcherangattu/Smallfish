# Mods

Claude Code mods for this repository. They change the session's own interface, not the
product.

## `smallfish-now`

A pane holding three things, so neither the owner nor a session has to ask where we are:

- **On you** — what is pending on Vimal and nobody else can clear.
- **In flight** — what the session is working on, plus the tool running this second.
- **Where the product is** — the build's current state.

It renders [`docs/NOW.md`](../../docs/NOW.md) and nothing else. That file is committed,
so the pane survives a session ending, a context compaction and a handover between the
GTM and Product streams.

### Why a file and not the session's task list

The task list was the obvious source and is the wrong one: it dies with the session, it
is invisible in the repository, and it is precisely what was lost on 2026-10-15 when this
session's context ran out and "where are we?" had to be rebuilt from git history, the
production database and live HTTP checks. A committed file cannot be lost that way.

The pane also says how old its reading is, and says so out loud when it cannot read the
file. A dashboard that quietly keeps showing yesterday's values is worse than no
dashboard, because it is believed.

### Running it

A session started in this repository does not load it automatically. Either:

```bash
claude --plugin-dir .claude/mods
```

or set `CLAUDE_CODE_PLUGIN_DIRS=.claude/mods`. In the Claude Code web and desktop apps,
a session that writes a mod into its own dev-mods folder is offered hot reloading once,
and the pane appears when that turn ends.

`/now` reopens the pane and prints the same thing as text.

### Keeping it honest

- `docs/NOW.md` must keep its four `##` headings exactly. Rename one and its section
  renders empty — deliberately, because guessing at a near-miss heading would hide the
  drift instead of showing it. `hooks/parse.test.ts` asserts that behaviour.
- Update `docs/NOW.md` in the same commit as the work it describes.

```bash
claude plugin validate .claude/mods/smallfish-now
claude plugin test .claude/mods/smallfish-now
```
