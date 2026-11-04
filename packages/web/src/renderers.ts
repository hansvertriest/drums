import type { Component } from 'vue';
import DummyArtifact from './components/artifacts/renderers/DummyArtifact.vue';

export interface ArtifactRenderer {
  /** The `renderer` an artifact kind names in core's registry. */
  id: string;
  component: Component;
}

/** Add a renderer: one new component in `components/artifacts/renderers/`, one line here. */
export const renderers: readonly ArtifactRenderer[] = [{ id: 'dummy', component: DummyArtifact }];

export function rendererFor(id: string): Component | undefined {
  return renderers.find((renderer) => renderer.id === id)?.component;
}
