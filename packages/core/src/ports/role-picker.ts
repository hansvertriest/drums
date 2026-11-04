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
  pick(request: RolePickRequest): Promise<RolePick[]>;
}
