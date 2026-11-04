import { describe, expect, it } from 'vitest';
import { tokensCss } from './index.js';

describe('tokensCss', () => {
  it('defines the tokens for light, system dark and forced dark', () => {
    expect(tokensCss).toContain('--bg:#E8ECF0');
    expect(tokensCss.match(/--bg:#11151B/g)).toHaveLength(2);
    expect(tokensCss).toContain('prefers-color-scheme: dark');
  });
});
