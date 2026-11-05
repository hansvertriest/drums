import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { writtenFiles } from './file-writes.js';

const root = mkdtempSync(join(tmpdir(), 'drums-writes-'));
const real = realpathSync(root);
const cwd = join(real, 'ws');
mkdirSync(join(cwd, 'api'), { recursive: true });
symlinkSync(cwd, join(real, 'link'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('the files a tool call writes', () => {
  it('reads the edit tools exactly, relative to the working directory', () => {
    expect(writtenFiles(cwd, 'Write', { file_path: join(cwd, 'scope.html'), content: 'x' })).toEqual(['scope.html']);
    expect(writtenFiles(cwd, 'Edit', { file_path: 'api/a.ts', old_string: 'a' })).toEqual(['api/a.ts']);
    expect(writtenFiles(cwd, 'NotebookEdit', { notebook_path: 'n.ipynb' })).toEqual(['n.ipynb']);
  });

  it('follows links, and leaves what is outside absolute', () => {
    expect(writtenFiles(cwd, 'Write', { file_path: join(real, 'link', 'a.html') })).toEqual(['a.html']);
    expect(writtenFiles(cwd, 'Write', { file_path: join(real, 'b.html') })).toEqual([join(real, 'b.html')]);
  });

  it('reads redirects, tee, cp and mv from a shell command', () => {
    const shell = (command: string) => writtenFiles(cwd, 'Bash', { command });
    expect(shell('cat > scope.html <<EOF\nhi\nEOF')).toEqual(['scope.html']);
    expect(shell('echo hi >> "a b.txt"; ls | tee -a c.html')).toEqual(['a b.txt', 'c.html']);
    expect(shell('cp -r src/x.html out.html && mv old.html new.html')).toEqual(['out.html', 'new.html']);
    expect(shell('npm test 2>&1 > /dev/null')).toEqual([]);
    expect(shell('ls api')).toEqual([]);
  });

  it('finds nothing in other tools or odd input', () => {
    expect(writtenFiles(cwd, 'Read', { file_path: 'a.html' })).toEqual([]);
    expect(writtenFiles(cwd, 'mcp__drums__post', { title: 'x' })).toEqual([]);
    expect(writtenFiles(cwd, 'Write', null)).toEqual([]);
    expect(writtenFiles(cwd, 'Write', { file_path: 3 })).toEqual([]);
  });
});
