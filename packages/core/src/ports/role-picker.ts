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
  goal: string;
  candidates: RoleCandidate[];
  hasRepos: boolean;
  /** Add agent: pick exactly one. */
  exactlyOne?: boolean;
}

export interface RolePicker {
  pick(request: RolePickRequest): Promise<RolePick[]>;
}
