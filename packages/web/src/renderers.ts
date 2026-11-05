import type { Component } from 'vue';
import BranchMap from './components/artifacts/renderers/BranchMap.vue';
import HtmlArtifact from './components/artifacts/renderers/HtmlArtifact.vue';

export interface ArtifactRenderer {
  /** The `renderer` an artifact kind names in core's registry. */
  id: string;
  component: Component;
  /** It shows its versions itself, and stays on screen as they arrive. */
  ownVersions?: boolean;
}

/** Add a renderer: one new component in `components/artifacts/renderers/`, one line here. */
export const renderers: readonly ArtifactRenderer[] = [
  { id: 'html', component: HtmlArtifact },
  { id: 'branch-map', component: BranchMap, ownVersions: true },
];

export function rendererFor(id: string): ArtifactRenderer | undefined {
  return renderers.find((renderer) => renderer.id === id);
}
