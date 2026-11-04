import { parseArgs } from 'node:util';

export const DEFAULT_PORT = 4180;

export interface CliArgs {
  port: number;
  open: boolean;
}

export function parseCliArgs(argv: string[]): CliArgs {
  const { values } = parseArgs({
    args: argv,
    options: {
      port: { type: 'string' },
      'no-open': { type: 'boolean', default: false },
    },
  });
  const port = values.port === undefined ? DEFAULT_PORT : Number(values.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`Invalid port: ${values.port}`);
  return { port, open: !values['no-open'] };
}
