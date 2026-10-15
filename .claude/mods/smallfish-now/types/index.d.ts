/** One parsed state of `docs/NOW.md`, plus how the last read went. */
export type Now = {
  /** Blocking items only the owner can clear. */
  onYou: string[]
  /** What the session is working on right now. */
  inFlight: string[]
  /** Where the build stands. */
  where: string[]
  /** Epoch ms of the last successful read. 0 before the first. */
  readAt: number
  /**
   * Why the last read failed, or null. Shown in the pane rather than swallowed:
   * a dashboard that silently keeps showing old values is the failure this mod
   * exists to prevent.
   */
  error: string | null
}

declare module 'claude-code' {
  interface PluginState {
    'smallfish-now': {
      now: Now
      /** The tool the session is running, for the live line under In flight. */
      running: string | null
    }
  }
}
