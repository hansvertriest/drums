import type { Artifact, ArtifactId, VersionNumber, VersionResponse } from '@drums/protocol';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

const versionKey = (id: ArtifactId, version: VersionNumber) => `${id}/${version}`;

/** Which version of an artifact is on screen; absent means it follows the latest. */
export const useArtifacts = defineStore('artifacts', () => {
  const artifacts = ref<Artifact[]>([]);
  const currentId = ref<ArtifactId>();
  const pinned = ref<Record<ArtifactId, VersionNumber>>({});
  /** Versions are immutable, so what has been loaded stays good. */
  const contents = ref<Record<string, VersionResponse>>({});

  const current = computed(() => artifacts.value.find((artifact) => artifact.id === currentId.value));
  const latest = computed(() => current.value?.versions.at(-1)?.version);
  const viewing = computed(() => {
    const id = currentId.value;
    return id === undefined ? undefined : (pinned.value[id] ?? latest.value);
  });
  const isLatest = computed(() => viewing.value === latest.value);
  const content = computed(() =>
    currentId.value !== undefined && viewing.value !== undefined
      ? contents.value[versionKey(currentId.value, viewing.value)]
      : undefined,
  );

  const open = (id: ArtifactId, version?: VersionNumber) => {
    currentId.value = id;
    const next = { ...pinned.value };
    const newest = artifacts.value.find((artifact) => artifact.id === id)?.versions.at(-1)?.version;
    if (version === undefined || version === newest) delete next[id];
    else next[id] = version;
    pinned.value = next;
  };

  const load = (next: Artifact[]) => {
    artifacts.value = next;
    if (!next.some((artifact) => artifact.id === currentId.value)) currentId.value = next[0]?.id;
  };

  const reset = () => {
    artifacts.value = [];
    currentId.value = undefined;
    pinned.value = {};
    contents.value = {};
  };

  /** A new version shows up right away, unless the user is reading an older one of that artifact. */
  const addVersion = (artifact: Artifact) => {
    const index = artifacts.value.findIndex((a) => a.id === artifact.id);
    if (index < 0) artifacts.value.push(artifact);
    else artifacts.value[index] = artifact;
    currentId.value ??= artifact.id;
    if (pinned.value[artifact.id] === undefined) currentId.value = artifact.id;
  };

  const setContent = (id: ArtifactId, response: VersionResponse) => {
    contents.value[versionKey(id, response.version.version)] = response;
  };

  return { artifacts, currentId, current, latest, viewing, isLatest, content, open, load, reset, addVersion, setContent };
});
