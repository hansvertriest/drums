import type { RoleId } from '@drums/protocol';

export interface RoleCandidate {
  id: RoleId;
  summary: string;
}

export interface RolePick {
  role: RoleId;
  instruction: string;
}

export interface RolePickRequest {
  /** The workspace's goal; for Add agent, what the new agent should do. */
  goal: string;
  /** Add agent: where the workspace stands. */
  overview?: string;
  candidates: RoleCandidate[];
  hasRepos: boolean;
  /** Add agent: pick exactly one. */
  exactlyOne?: boolean;
}

export interface RolePicker {
  /**
   * Chooses from `candidates`. May return nothing, and rejects if it can't answer in reasonable
   * time: a hung call must end here, because creating a workspace waits for it.
   */
  pick(request: RolePickRequest): Promise<RolePick[]>;
}
