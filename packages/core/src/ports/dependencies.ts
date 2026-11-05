export interface Dependencies {
  /** Installs what the worktree's lockfile pins. Nothing happens without a lockfile. Throws, in words a person can act on, if it fails. */
  install(worktree: string): Promise<void>;
}
