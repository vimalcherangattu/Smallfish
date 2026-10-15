/**
 * The parsing, because the pane is only as good as it.
 *
 * The failure that matters is silent: a heading renamed in `docs/NOW.md` leaves
 * the pane showing an empty section rather than an error, and an empty "On you"
 * reads as *nothing is pending on you* — the most expensive wrong answer this
 * mod could give. So the sections are asserted by name, and the rest of these
 * are the ways a hand-edit goes wrong.
 */

import { expect, test } from 'claude-code/testing'

import { age, parse } from './register.tsx'

const FILE = `# Now

Some prose about the file that must not reach the pane.

- a bullet before any heading, which belongs to nothing

## On Vimal

Prose under a heading is skipped.

- Apify: token + \`APIFY_ACTOR=compass~crawler-google-places\`
- **Price per fit.** Needs milestone 3 first.

## In flight

- Milestone 1: apply the approved KEEP / HIDE / DELETE.

## Where the product is

- PRD v2 adopted 2026-10-15. Milestone 1 of 6.
- Production: live on \`main\`, suite 74/74.
`

test('pulls the three lists out and keeps them in order', () => {
  const got = parse(FILE)
  expect(got.onYou.length).toBe(2)
  expect(got.inFlight.length).toBe(1)
  expect(got.where.length).toBe(2)
  expect(got.where[0]).toContain('PRD v2 adopted')
})

test('drops markdown the pane cannot render', () => {
  // Backticks and bold would show as literal characters in a Text element.
  const got = parse(FILE)
  expect(got.onYou[0]).toBe('Apify: token + APIFY_ACTOR=compass~crawler-google-places')
  expect(got.onYou[1]).toBe('Price per fit. Needs milestone 3 first.')
  expect(got.where[1]).toBe('Production: live on main, suite 74/74.')
})

test('ignores bullets that belong to no section', () => {
  // The one before the first heading is a note to an editor, not an item.
  const got = parse(FILE)
  const all = [...got.onYou, ...got.inFlight, ...got.where].join(' ')
  expect(all).not.toContain('belongs to nothing')
})

test('a renamed heading empties its section rather than guessing', () => {
  // Deliberate: the pane shows "nothing" and the file is the thing to fix.
  // Guessing at a near-miss heading would be worse, because then nobody learns
  // the file drifted.
  const got = parse(FILE.replace('## On Vimal', '## On the owner'))
  expect(got.onYou.length).toBe(0)
  expect(got.inFlight.length).toBe(1)
})

test('an empty or garbage file parses to empty and never throws', () => {
  for (const text of ['', '\n\n', 'no headings at all', '## Unrelated\n- x']) {
    const got = parse(text)
    expect(got.onYou.length).toBe(0)
    expect(got.inFlight.length).toBe(0)
    expect(got.where.length).toBe(0)
  }
})

test('takes asterisk bullets too, since both are valid markdown', () => {
  const got = parse('## In flight\n* starred item\n')
  expect(got.inFlight[0]).toBe('starred item')
})

test('age rounds and does not pretend to precision', () => {
  expect(age(0)).toBe('just now')
  expect(age(5_000)).toBe('just now')
  expect(age(30_000)).toBe('30s ago')
  expect(age(5 * 60_000)).toBe('5m ago')
  expect(age(3 * 3_600_000)).toBe('3h ago')
  expect(age(2 * 86_400_000)).toBe('2d ago')
})

test('a clock that went backwards reads as just now, not a negative age', () => {
  expect(age(-5_000)).toBe('just now')
})
