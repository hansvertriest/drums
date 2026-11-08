import { describe, expect, it } from 'vitest';
import { artifactCss, tokensCss } from './index.js';

describe('tokensCss', () => {
  it('defines the tokens for light, system dark and forced dark', () => {
    expect(tokensCss).toContain('--bg:#E8ECF0');
    expect(tokensCss.match(/--bg:#11151B/g)).toHaveLength(2);
    expect(tokensCss).toContain('prefers-color-scheme: dark');
  });
});

describe('artifactCss', () => {
  it('keeps an iPhone from zooming on fields inside an artifact', () => {
    expect(artifactCss).toContain('@media (hover:none) and (pointer:coarse){input,textarea,select{font-size:16px!important}}');
  });
});
