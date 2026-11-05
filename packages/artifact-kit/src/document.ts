import { artifactCss } from './artifact-css.js';
import { bridgeScript } from './bridge.js';
import { tokensCss } from './tokens.js';

/**
 * What an artifact's iframe may do: run its own inline code and styles, and nothing
 * that leaves the frame. Goes first in the document, so nothing in the artifact runs before it.
 */
export const artifactCsp = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'img-src data:',
  'font-src data:',
  'media-src data:',
  "form-action 'none'",
  "base-uri 'none'",
].join('; ');

/** The attribute value of the iframe. Never add `allow-same-origin`: it would give the artifact the app. */
export const artifactSandbox = 'allow-scripts';

/** A complete document around an artifact's HTML fragment, for an iframe's `srcdoc`. */
export function artifactDocument(fragment: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta http-equiv="Content-Security-Policy" content="${artifactCsp}">
<meta charset="utf-8">
<style>${tokensCss}${artifactCss}</style>
<script>${bridgeScript}</script>
</head>
<body><main class="doc">${fragment}</main></body>
</html>`;
}
