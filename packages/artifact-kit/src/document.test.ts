import { describe, expect, it } from 'vitest';
import { artifactCsp, artifactDocument, artifactSandbox } from './index.js';

describe('artifactDocument', () => {
  it('puts the CSP before anything from the artifact', () => {
    const doc = artifactDocument('<script>fetch("https://x")</script>');
    expect(doc.indexOf('Content-Security-Policy')).toBeLessThan(doc.indexOf('fetch('));
    expect(doc.indexOf('Content-Security-Policy')).toBeLessThan(doc.indexOf('<style>'));
  });

  it('allows no network', () => {
    expect(artifactCsp).toContain("default-src 'none'");
    expect(artifactCsp).not.toMatch(/https?:|\*|'self'/);
  });

  it('asks the browser to block peer connections, which default-src does not cover', () => {
    expect(artifactCsp).toContain("webrtc 'block'");
  });

  it('never makes the iframe same-origin', () => {
    expect(artifactSandbox).toBe('allow-scripts');
  });
});
