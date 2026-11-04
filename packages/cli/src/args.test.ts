import { describe, expect, it } from 'vitest';
import { DEFAULT_PORT, parseCliArgs } from './args.js';

describe('parseCliArgs', () => {
  it('defaults to the drums port and opening the browser', () => {
    expect(parseCliArgs([])).toEqual({ port: DEFAULT_PORT, open: true });
  });

  it('reads --port and --no-open', () => {
    expect(parseCliArgs(['--port', '5000', '--no-open'])).toEqual({ port: 5000, open: false });
  });

  it('refuses a bad port', () => {
    expect(() => parseCliArgs(['--port', 'abc'])).toThrow('Invalid port: abc');
  });
});
