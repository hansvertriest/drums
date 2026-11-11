import type { WorkspaceSummary } from '@drums/protocol';
import { computed } from 'vue';
import { useAnswers } from '../stores/answers';
import { useMap } from '../stores/map';
import { useWorkspaces } from '../stores/workspaces';

const STATUS_LABEL: Record<string, string> = {
  input: 'Needs input',
  review: 'Ready for review',
  running: 'Running',
  idle: 'Idle',
};

/** What a workspace is called on screen: its title, or its goal if it has none. */
export const workspaceName = ({ title, goal }: Pick<WorkspaceSummary, 'title' | 'goal'>) => title ?? goal;

/** What the headings say about the open workspace, wherever they sit. */
export function useWorkspaceSummary() {
  const workspaces = useWorkspaces();
  const answers = useAnswers();
  const map = useMap();

  const name = computed(() => (workspaces.current ? workspaceName(workspaces.current) : 'drums'));
  const status = computed(() => workspaces.current?.status);
  const statusLabel = computed(() => status.value && STATUS_LABEL[status.value]);
  const pendingCount = computed(() => answers.pendingCount + map.pendingComments);

  return { name, status, statusLabel, pendingCount };
}
