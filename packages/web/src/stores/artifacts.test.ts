import type { Artifact } from '@drums/protocol';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useArtifacts } from './artifacts';

const at = '2026-01-01T10:00:00.000Z';
const artifact = (id: string, versions: number[]): Artifact => ({
  id,
  title: id,
  kind: 'html',
  renderer: 'html',
  createdAt: at,
  versions: versions.map((version) => ({ version, by: 'ag', note: '', at })),
});

beforeEach(() => setActivePinia(createPinia()));

describe('the artifacts store', () => {
  it('follows the latest version as it arrives', () => {
    const store = useArtifacts();
    store.addVersion(artifact('a1', [1]));
    expect(store.viewing).toBe(1);
    store.addVersion(artifact('a1', [1, 2]));
    expect(store.viewing).toBe(2);
    expect(store.isLatest).toBe(true);
  });

  it('stays on an older version the user is reading', () => {
    const store = useArtifacts();
    store.load([artifact('a1', [1, 2])]);
    store.open('a1', 1);
    store.addVersion(artifact('a1', [1, 2, 3]));
    expect(store.viewing).toBe(1);
    expect(store.isLatest).toBe(false);
  });

  it('switches to a new artifact when asked to bring it forward', () => {
    const store = useArtifacts();
    store.load([artifact('a1', [1])]);
    store.addVersion(artifact('a2', [1]));
    expect(store.currentId).toBe('a2');
  });

  it('stays put when another agent posts elsewhere, but still lists it', () => {
    const store = useArtifacts();
    store.load([artifact('a1', [1])]);
    store.addVersion(artifact('a2', [1]), false);
    expect(store.currentId).toBe('a1');
    expect(store.artifacts.map((a) => a.id)).toEqual(['a1', 'a2']);
    store.addVersion(artifact('a1', [1, 2]), false);
    expect(store.viewing).toBe(2);
  });

  it('puts a first artifact on an empty stage whoever posted it', () => {
    const store = useArtifacts();
    store.addVersion(artifact('a1', [1]), false);
    expect(store.currentId).toBe('a1');
  });
});
