import {
  Agent,
  AnswerSet,
  ApiError as ApiErrorBody,
  Artifact,
  MapState,
  OpenPrsResponse,
  PrDrafts,
  ProjectList,
  VersionResponse,
  WorkspaceList,
  WorkspaceState,
  type Answer,
  type CreateWorkspaceRequest,
  type ImageType,
  type OpenPrsRequest,
  type PermissionDecision,
  type Focus,
  type VersionNumber,
} from '@drums/protocol';

/** A refusal from the server, with its message for the user. */
export class ApiError extends Error {
  override readonly name = 'ApiError';
}

interface Parser<T> {
  parse(data: unknown): T;
}

async function request<T>(path: string, schema: Parser<T> | undefined, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) {
    const body = ApiErrorBody.safeParse(await response.json().catch(() => undefined));
    throw new ApiError(body.success ? body.data.error : `The server answered ${response.status}.`);
  }
  return schema ? schema.parse(await response.json()) : (undefined as T);
}

const withBody = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

const workspacePath = (ws: string) => `/api/workspaces/${encodeURIComponent(ws)}`;

/** The typed client for the HTTP API. Everything it returns went through the protocol's schemas. */
export const api = {
  listWorkspaces: () => request('/api/workspaces', WorkspaceList),
  createWorkspace: (body: CreateWorkspaceRequest) => request('/api/workspaces', WorkspaceState, withBody('POST', body)),
  projects: () => request('/api/projects', ProjectList),
  workspace: (ws: string) => request(workspacePath(ws), WorkspaceState),
  addAgent: (ws: string, instruction: string) => request(`${workspacePath(ws)}/agents`, Agent, withBody('POST', { instruction })),
  sendMessage: (ws: string, agent: string, text: string, focus?: Focus, images: Array<{ type: ImageType; data: string }> = []) =>
    request(`${workspacePath(ws)}/agents/${encodeURIComponent(agent)}/messages`, undefined, withBody('POST', { text, focus, ...(images.length > 0 ? { images } : {}) })),
  imageUrl: (ws: string, name: string) => `${workspacePath(ws)}/images/${encodeURIComponent(name)}`,
  stop: (ws: string, agent: string) =>
    request(`${workspacePath(ws)}/agents/${encodeURIComponent(agent)}/stop`, undefined, { method: 'POST' }),
  closeAgent: (ws: string, agent: string) =>
    request<void>(`${workspacePath(ws)}/agents/${encodeURIComponent(agent)}/close`, undefined, { method: 'POST' }),
  archive: (ws: string) => request<void>(`${workspacePath(ws)}/archive`, undefined, { method: 'POST' }),
  restore: (ws: string) => request<void>(`${workspacePath(ws)}/restore`, undefined, { method: 'POST' }),
  setArtifactArchived: (ws: string, artifact: string, archived: boolean) =>
    request(`${workspacePath(ws)}/artifacts/${encodeURIComponent(artifact)}/${archived ? 'archive' : 'restore'}`, Artifact, { method: 'POST' }),
  version: (ws: string, artifact: string, version: VersionNumber) =>
    request(`${workspacePath(ws)}/artifacts/${encodeURIComponent(artifact)}/versions/${version}`, VersionResponse),
  saveAnswers: (ws: string, artifact: string, version: VersionNumber, answers: Answer[]) =>
    request(`${workspacePath(ws)}/artifacts/${encodeURIComponent(artifact)}/answers`, AnswerSet, withBody('PUT', { version, answers })),
  map: (ws: string) => request(`${workspacePath(ws)}/map`, MapState),
  prDrafts: (ws: string) => request(`${workspacePath(ws)}/prs`, PrDrafts),
  openPrs: (ws: string, body: OpenPrsRequest) => request(`${workspacePath(ws)}/prs`, OpenPrsResponse, withBody('POST', body)),
  answerPermission: (ws: string, agent: string, id: string, decision: PermissionDecision) =>
    request<void>(`${workspacePath(ws)}/agents/${encodeURIComponent(agent)}/permissions/${encodeURIComponent(id)}`, undefined, withBody('POST', { decision })),
  send: (ws: string, body: { overall?: string | undefined; to?: string | undefined }) =>
    request<void>(`${workspacePath(ws)}/send`, undefined, withBody('POST', body)),
};
