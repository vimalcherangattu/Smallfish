/**
 * What is pending on Vimal, what the session is doing, and where the build is.
 *
 * ## Why this reads a file instead of the task list
 *
 * The obvious source is the session's own task list. It is the wrong one: it
 * lives and dies with a session, it is not visible in the repository, and it is
 * exactly what was lost when this session's context ran out on 2026-10-15 and
 * "where are we?" had to be rebuilt from git, the database and production.
 *
 * `docs/NOW.md` is committed, so it survives a session ending, a context
 * compaction and a handover to the other stream. The pane is a view of it, not
 * a second copy — there is one place to edit and it is the one the next session
 * reads first.
 *
 * ## It says when it is stale, and when it could not read
 *
 * A dashboard that keeps showing yesterday's values is worse than no dashboard,
 * because it is believed. So the pane carries the age of what it is showing and
 * says plainly when the file could not be read, rather than silently holding
 * the last good parse.
 */

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Now } from '../types'

const PANE = 'smallfish-now'
const FILE = 'docs/NOW.md'

/** How often the file is re-read. The pane only redraws when it changed. */
const EVERY_MS = 4000

const EMPTY: Now = { onYou: [], inFlight: [], where: [], readAt: 0, error: null }

const now = atom({ plugin: 'smallfish-now', key: 'now' } as const, EMPTY)
const running = atom({ plugin: 'smallfish-now', key: 'running' } as const, null)

/**
 * Pull the three lists out of the markdown.
 *
 * Deliberately dumb: find an `## ` heading by name, take the `- ` lines under
 * it, stop at the next heading. No markdown library, because the file is ours
 * and the format is four headings and some bullets. Prose paragraphs between a
 * heading and its bullets are skipped rather than rendered, which is what lets
 * the file carry its own editing rules without them reaching the pane.
 */
export function parse(text: string): Omit<Now, 'readAt' | 'error'> {
  const onYou: string[] = []
  const inFlight: string[] = []
  const where: string[] = []

  /** The section being read, or null between the top and the first heading. */
  let into: string[] | null = null

  for (const raw of text.split('\n')) {
    const line = raw.trimEnd()
    if (line.startsWith('#')) {
      into =
        line === '## On Vimal'
          ? onYou
          : line === '## In flight'
            ? inFlight
            : line === '## Where the product is'
              ? where
              : null
      continue
    }
    if (!into) continue
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line)
    const item = bullet?.[1]
    if (item) into.push(strip(item))
  }
  return { onYou, inFlight, where }
}

/** Markdown emphasis and code ticks, out. A pane renders text, not markdown. */
const strip = (s: string): string =>
  s
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .trim()

/** Rounded, and never pretending to a precision it does not have. */
export function age(ms: number): string {
  if (ms < 0) return 'just now'
  const s = Math.floor(ms / 1000)
  if (s < 10) return 'just now'
  if (s < 90) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`
}

/** Read and store, but only write when something actually changed. */
async function refresh($: EngineInterface) {
  let next: Now
  try {
    const text = await $.fs.read(FILE)
    next = { ...parse(text), readAt: await $.clock.now(), error: null }
  } catch (err) {
    const was: Now = await read($, now)
    next = { ...was, error: `could not read ${FILE}: ${String((err as Error)?.message ?? err)}` }
  }

  const was: Now = await read($, now)
  // Compare the content and not `readAt`, so an unchanged file does not redraw
  // the pane every four seconds.
  const same =
    was.error === next.error &&
    was.onYou.join('|') === next.onYou.join('|') &&
    was.inFlight.join('|') === next.inFlight.join('|') &&
    was.where.join('|') === next.where.join('|')
  if (same && was.readAt > 0) return

  await update($, now, () => next)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'now',
      description: 'Show what is pending on you and where the Small Fish build stands',
    })

    await refresh($)
    void $.ui.open({ id: PANE, title: 'Small Fish — now' })

    // The file is edited by this session and by the other stream, so the pane
    // follows it rather than being told.
    $.clock.every(EVERY_MS, () => void refresh($))

    const state: Now = await read($, now)
    if (state.onYou.length) void $.ui.status(`${state.onYou.length} on you`)

    return next(e)
  })

  on('command.run', { command: 'now' }, async $ => {
    await refresh($)
    await $.ui.open({ id: PANE, title: 'Small Fish — now' })

    const state: Now = await read($, now)
    const lines = [
      ...(state.error ? [state.error] : []),
      ...(state.onYou.length ? ['On you:', ...state.onYou.map(t => `  - ${t}`)] : ['Nothing is pending on you.']),
      ...(state.inFlight.length ? ['', 'In flight:', ...state.inFlight.map(t => `  - ${t}`)] : []),
    ]
    return { text: lines.join('\n') }
  })

  // The live half the file cannot know: what is running this second.
  //
  // This hook sits in front of every tool call in the session for a line of
  // decoration, so it must never be able to stop one. The handler lets the call
  // through whatever went wrong: where this hook threw before `next`, `next(e)`
  // runs the tool; where it threw after, `next(e)` replays what that call
  // already settled to and nothing runs twice. A cosmetic pane that can break
  // Bash is not a trade worth making.
  on('tool.call', async ($, e, next) => {
    await update($, running, () => e.tool)
    try {
      return await next(e)
    } finally {
      await update($, running, () => null)
    }
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const state: Now = await read($, now)
    const tool: string | null = await read($, running)
    const at = await $.clock.now()

    const section = (title: string, items: string[], colour?: string) => (
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color={colour}>
          {title}
        </Text>
        {items.length === 0 && <Text dimColor>nothing</Text>}
        {items.map(item => (
          <Text wrap="wrap">{`- ${item}`}</Text>
        ))}
      </Box>
    )

    return (
      <Box flexDirection="column">
        {state.error && (
          <Box marginBottom={1}>
            <Text color="red" wrap="wrap">
              {state.error}
            </Text>
          </Box>
        )}

        {section(`On you (${state.onYou.length})`, state.onYou, 'yellow')}

        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="cyan">
            In flight
          </Text>
          {state.inFlight.length === 0 && <Text dimColor>nothing</Text>}
          {state.inFlight.map(item => (
            <Text wrap="wrap">{`- ${item}`}</Text>
          ))}
          {tool && <Text dimColor>{`  running ${tool}`}</Text>}
        </Box>

        {section('Where the product is', state.where)}

        <Text dimColor>
          {state.readAt === 0 ? FILE : `${FILE}, read ${age(at - state.readAt)}`}
        </Text>
      </Box>
    )
  })
}
