import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CodeReviewSession } from '@drums/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTempRepo, runGit, tempDirs, writeFile } from '../../testing/temp-repo.js';
import { createDyffleCodeReview } from './code-review.js';

const dirs = tempDirs();
const opened: CodeReviewSession[] = [];
let parent: string;
let repo: string;
let review: ReturnType<typeof createDyffleCodeReview>;

const viewerUrl = 'http://127.0.0.1:9/map/t/w/repo/';
const open = async (worktree = repo, baseRef = 'main') => {
  const session = await review.open({ worktree, baseRef, viewerUrl });
  opened.push(session);
  return session;
};

beforeEach(() => {
  parent = dirs.make('drums-dyffle-');
  ({ path: repo } = createTempRepo(parent));
  review = createDyffleCodeReview({ baseCacheDir: join(parent, 'cache') });
});
afterEach(async () => {
  await Promise.all(opened.splice(0).map((session) => session.stop()));
  dirs.cleanup();
});

const CHANGED = `export function add(a: number, b: number, c = 0): number {
  return a + b + c;
}

export function twice(a: number): number {
  return add(a, a);
}
`;

describe('a session', () => {
  it('announces itself so `dyffle post` works, and takes that back on stop', async () => {
    const session = await open();
    const file = join(repo, '.dyffle', 'server.json');
    expect(JSON.parse(readFileSync(file, 'utf8')).url).toBe(viewerUrl);
    await session.stop();
    expect(existsSync(file)).toBe(false);
  });

  it('keeps the base index in the shared folder', async () => {
    await open();
    expect(existsSync(join(parent, 'cache'))).toBe(true);
    expect(existsSync(join(repo, '.dyffle'))).toBe(true);
  });

  it('checkpoints in process, with a change once and none after', async () => {
    const session = await open();
    writeFile(repo, 'src/math.ts', CHANGED);
    const first = await session.checkpoint({ title: 'Add c', message: 'Adds `c`', author: 'Coder' });
    expect(first.post).toBe(1);
    expect(first.stats?.files).toBe(1);
    expect(JSON.parse(readFileSync(join(repo, '.dyffle', 'posts', '0001.json'), 'utf8'))).toMatchObject({ title: 'Add c', author: 'Coder' });
    const second = await session.checkpoint({ title: 'Nothing', message: 'x', author: 'Coder' });
    expect(second.stats).toBeUndefined();
  });

  it('does not reject a post because a listener throws', async () => {
    const session = await open();
    session.subscribe(() => {
      throw new Error('a bad listener');
    });
    session.map.subscribe(() => {
      throw new Error('a bad frame');
    });
    writeFile(repo, 'src/math.ts', CHANGED);
    await expect(session.checkpoint({ title: 'T', message: 'm', author: 'a' })).resolves.toMatchObject({ post: 1 });
    expect(JSON.parse(session.map.feed()).posts).toHaveLength(1);
  });

  it('tells listeners what changed, in the port\'s terms', async () => {
    const session = await open();
    const seen: string[] = [];
    session.subscribe((event) => seen.push(event));
    writeFile(repo, 'src/math.ts', CHANGED);
    await session.checkpoint({ title: 'T', message: 'm', author: 'a' });
    expect(seen).toContain('feed');
  });

  it('resumes: a new session on the same worktree keeps the posts, and measures from the last', async () => {
    const first = await open();
    writeFile(repo, 'src/math.ts', CHANGED);
    await first.checkpoint({ title: 'One', message: 'm', author: 'a' });
    await first.stop();
    const second = await open();
    expect(JSON.parse(second.map.feed()).posts).toHaveLength(1);
    expect((await second.checkpoint({ title: 'Two', message: 'm', author: 'a' })).stats).toBeUndefined();
    writeFile(repo, 'src/other.ts', 'export const x = 1;\n');
    const third = await second.checkpoint({ title: 'Three', message: 'm', author: 'a' });
    expect(third).toMatchObject({ post: 3, stats: { files: 1 } });
  });

  it('fails cleanly on a base that does not exist', async () => {
    await expect(review.open({ worktree: repo, baseRef: 'no-such-branch', viewerUrl })).rejects.toThrow();
  });
});

describe('impact', () => {
  it('sees an edit made just now', async () => {
    const session = await open();
    writeFile(repo, 'src/math.ts', CHANGED);
    const result = await session.impact('add');
    expect(result).toMatchObject({ status: 'found', markdown: expect.stringMatching(/signature changed/) });
  });

  it('answers all four shapes', async () => {
    const session = await open();
    writeFile(repo, 'src/more.ts', 'export class A { add(): void {} }\nexport class B { add(): void {} }\n');
    expect(await session.impact()).toMatchObject({ status: 'found' });
    expect(await session.impact('src/math.ts')).toMatchObject({ status: 'found', markdown: expect.stringContaining('twice') });
    expect(await session.impact('twice')).toMatchObject({ status: 'found' });
    expect(await session.impact('A.add')).toMatchObject({ status: 'found' });
    expect((await session.impact('add')).status).toBe('ambiguous');
  });

  it('turns an unknown target into a result', async () => {
    const session = await open();
    expect(await session.impact('nothingLikeThis')).toMatchObject({ status: 'not-found', message: expect.stringMatching(/nothingLikeThis/) });
  });
});

describe('the PR report', () => {
  it('embeds the report between the markers, and replaces it the second time', async () => {
    const session = await open();
    writeFile(repo, 'src/math.ts', CHANGED);
    const once = await session.withReport('My description');
    expect(once.indexOf('My description')).toBe(0);
    expect(once).toContain('<!-- dyffle:start -->');
    expect(once).toContain('<!-- dyffle:end -->');
    expect(once).toMatch(/signature|changed|add/i);
    const twice = await session.withReport(`${once}\n\nmore`);
    expect(twice.match(/<!-- dyffle:start -->/g)).toHaveLength(1);
    expect(twice).toContain('more');
  });
});

describe('reviews', () => {
  const comment = { id: 'c1', path: 'src/math.ts', line: 2, side: 'RIGHT', body: 'Why c?', code: '  return a + b + c;', symbol: 'src/math.ts#add', created: 1 };
  const save = (session: CodeReviewSession, comments: unknown[], body = '', viewed = {}) =>
    session.map.saveReview('live', JSON.stringify({ body, comments, viewed }));

  it('has nothing pending without comments', async () => {
    await open();
    expect(await review.pendingReview(repo, [])).toEqual({ markdown: '', comments: 0, marks: [] });
  });

  it('gives the Markdown of `dyffle comments` for what is pending', async () => {
    const session = await open();
    writeFile(repo, 'src/math.ts', CHANGED);
    await session.impact();
    save(session, [comment]);
    const pending = await review.pendingReview(repo, []);
    expect(pending.comments).toBe(1);
    expect(pending.markdown).toContain('## Whole branch (live)');
    expect(pending.markdown).toContain('**src/math.ts:2 in `add`**');
    expect(pending.markdown).toContain('Why c?');
    expect(pending.markdown).not.toContain('outdated');
  });

  it('marks a comment outdated when its line moved on, as dyffle does', async () => {
    const session = await open();
    writeFile(repo, 'src/math.ts', CHANGED);
    save(session, [{ ...comment, code: 'something else' }]);
    expect((await review.pendingReview(repo, [])).markdown).toContain('outdated');
  });

  it('leaves out what was delivered, and brings back an edited comment and new ones', async () => {
    const session = await open();
    save(session, [comment]);
    const first = await review.pendingReview(repo, []);
    expect(await review.pendingReview(repo, first.marks)).toMatchObject({ comments: 0, markdown: '' });
    save(session, [{ ...comment, body: 'Actually, why c?' }, { ...comment, id: 'c2', line: 1, body: 'And this' }]);
    const next = await review.pendingReview(repo, first.marks);
    expect(next.comments).toBe(2);
    save(session, [comment, { ...comment, id: 'c2', line: 1, body: 'And this' }]);
    const onlyNew = await review.pendingReview(repo, first.marks);
    expect(onlyNew.comments).toBe(1);
    expect(onlyNew.markdown).toContain('And this');
    expect(onlyNew.markdown).not.toContain('Why c?');
  });

  it('counts an overall comment as pending, with no line comments', async () => {
    const session = await open();
    save(session, [], 'Looks fine overall');
    const pending = await review.pendingReview(repo, []);
    expect(pending).toMatchObject({ comments: 0, marks: [expect.any(String)] });
    expect(pending.markdown).toContain('Looks fine overall');
  });

  it('keeps comments and Viewed in the worktree, through the session', async () => {
    const session = await open();
    save(session, [comment], '', { 'src/math.ts': 'hash' });
    expect(JSON.parse(session.map.review('live')!)).toMatchObject({ viewed: { 'src/math.ts': 'hash' }, comments: [{ id: 'c1' }] });
    expect(existsSync(join(repo, '.dyffle', 'reviews', 'live.json'))).toBe(true);
    expect(() => session.map.saveReview('live', '{"nope":1}')).toThrow(expect.objectContaining({ name: 'InvalidError' }));
  });
});

describe('two sessions on worktrees of one repo', () => {
  it('do not interfere, and share the base index', async () => {
    runGit(repo, 'worktree', 'add', '-b', 'one', join(parent, 'a'), 'main');
    runGit(repo, 'worktree', 'add', '-b', 'two', join(parent, 'b'), 'main');
    const [a, b] = [await open(join(parent, 'a')), await open(join(parent, 'b'))];
    writeFile(join(parent, 'a'), 'src/a.ts', 'export const a = 1;\n');
    writeFile(join(parent, 'b'), 'src/b.ts', 'export const b = 1;\nexport const c = 2;\n');
    const [first, second] = [await a.checkpoint({ title: 'A', message: 'm', author: 'x' }), await b.checkpoint({ title: 'B', message: 'm', author: 'y' })];
    expect(first).toMatchObject({ post: 1, stats: { files: 1, additions: 1 } });
    expect(second).toMatchObject({ post: 1, stats: { files: 1, additions: 2 } });
    expect(a.map.index(0)).not.toContain('src/b.ts');
    expect(b.map.index(0)).not.toContain('src/a.ts');
    const refs = runGit(repo, 'for-each-ref', '--format=%(refname)', 'refs/dyffle');
    expect(refs).toMatch(/refs\/dyffle\/worktrees\/a\/posts\/1/);
    expect(refs).toMatch(/refs\/dyffle\/worktrees\/b\/posts\/1/);
  });
});

describe('the viewer', () => {
  it('serves the page without web fonts', () => {
    const html = review.viewerHtml();
    expect(html).toContain('<script>');
    expect(html).not.toContain('fonts.googleapis');
  });
});
