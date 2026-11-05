import type { WorkspaceSummary } from '@drums/protocol';

/** What a workspace is called on screen: its title, or its goal if it has none. */
export const workspaceName = ({ title, goal }: Pick<WorkspaceSummary, 'title' | 'goal'>) => title ?? goal;
