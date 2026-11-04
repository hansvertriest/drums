import type { Component } from 'vue';
import HtmlArtifact from './components/artifacts/renderers/HtmlArtifact.vue';

export interface ArtifactRenderer {
  /** The `renderer` an artifact kind names in core's registry. */
  id: string;
  component: Component;
}

/** Add a renderer: one new component in `components/artifacts/renderers/`, one line here. */
export const renderers: readonly ArtifactRenderer[] = [{ id: 'html', component: HtmlArtifact }];

export function rendererFor(id: string): Component | undefined {
  return renderers.find((renderer) => renderer.id === id)?.component;
}
