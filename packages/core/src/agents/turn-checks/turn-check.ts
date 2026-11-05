import type { Agent, Post, Workspace } from '@drums/protocol';
import type { CodeService } from '../../code/code-service.js';
import type { RoleDefinition } from '../../roles/role-definition.js';

/** A turn that ended, as far as the checks can see it. */
export interface EndedTurn {
  workspace: Workspace;
  agent: Agent;
  role: RoleDefinition;
  /** Files its tool calls are known to have written: relative to the workspace folder when inside it. */
  writes: readonly string[];
  /** What this agent posted during the turn. */
  posts: readonly Post[];
}

/** What checks may call. Services only, as with tools. */
export interface TurnCheckServices {
  code: Pick<CodeService, 'uncheckpointed' | 'checkpoint'>;
}

/**
 * Prompts are followed most of the time, not always, so the app checks when a turn ends (spec §4.3).
 * Add a check: one new file in this folder, one line in `registry.ts`.
 */
export interface TurnCheck {
  id: string;
  /** One or two short sentences to the agent. */
  nudge: string;
  /** Whether the turn left something undone. */
  detect(turn: EndedTurn, services: TurnCheckServices): Promise<boolean>;
  /** What drums does itself if `detect` still holds after the nudge's turn. Without it, the nudge is all there is. */
  whenIgnored?(turn: EndedTurn, services: TurnCheckServices): Promise<void>;
}
