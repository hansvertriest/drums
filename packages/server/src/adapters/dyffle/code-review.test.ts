import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
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

interface View {
  kind: string;
  title: string;
  stats?: { files: number; additions: number };
}
const viewsOf = (session: CodeReviewSession) => (JSON.parse(session.map.views()) as { views: View[] }).views;
const commit = (dir: string, message: string) => {
  runGit(dir, 'add', '-A');
  runGit(dir, 'commit', '-qm', message);
};

describe('a session', () => {
  it('announces itself so `dyffle comments` works, and takes that back on stop', async () => {
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

  it('keeps a dyffle of the branch, one per commit, and one of the uncommitted changes', async () => {
    const session = await open();
    runGit(repo, 'checkout', '-q', '-b', 'feature');
    writeFile(repo, 'src/math.ts', CHANGED);
    commit(repo, 'Add c');
    writeFile(repo, 'src/other.ts', 'export const x = 1;\n');
    await session.impact();
    const views = viewsOf(session);
    expect(views.map((v) => [v.kind, v.title])).toEqual([
      ['branch', 'Whole branch'],
      ['commit', 'Add c'],
      ['uncommitted', 'Uncommitted changes'],
    ]);
    expect(views.map((v) => v.stats?.files)).toEqual([2, 1, 1]);
    expect(JSON.parse(session.map.index(1)!).pr.changedFiles).toEqual(['src/math.ts']);
  });

  it('does not let a listener that throws stop a rebuild', async () => {
    const session = await open();
    session.subscribe(() => {
      throw new Error('a bad listener');
    });
    session.map.subscribe(() => {
      throw new Error('a bad frame');
    });
    writeFile(repo, 'src/math.ts', CHANGED);
    await session.impact();
    expect(viewsOf(session).at(-1)?.stats?.files).toBe(1);
  });

  it('tells listeners what changed, in the port\'s terms', async () => {
    const session = await open();
    const seen: string[] = [];
    session.subscribe((event) => seen.push(event));
    writeFile(repo, 'src/math.ts', CHANGED);
    await session.impact();
    expect(seen).toContain('views');
    expect(seen).not.toContain('feed');
  });

  it('resumes: a new session on the same worktree keeps the commits and reviews', async () => {
    const first = await open();
    runGit(repo, 'checkout', '-q', '-b', 'feature');
    writeFile(repo, 'src/math.ts', CHANGED);
    commit(repo, 'One');
    await first.impact();
    const sha = runGit(repo, 'rev-parse', 'HEAD').trim();
    first.map.saveReview(`commit-${sha}`, JSON.stringify({ body: 'ok', comments: [], viewed: {} }));
    await first.stop();
    const second = await open();
    expect(viewsOf(second).map((v) => v.title)).toEqual(['Whole branch', 'One', 'Uncommitted changes']);
    expect(JSON.parse(second.map.review(`commit-${sha}`)!).body).toBe('ok');
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

  it('leaves out reviews of feed posts from before dyffle 0.7, which nothing shows any more', async () => {
    const session = await open();
    save(session, [comment]);
    writeFileSync(join(repo, '.dyffle', 'reviews', 'post-1.json'), JSON.stringify({ key: 'post-1', body: 'Old', comments: [{ ...comment, id: 'old' }], viewed: {} }));
    const pending = await review.pendingReview(repo, []);
    expect(pending.comments).toBe(1);
    expect(pending.markdown).not.toContain('Old');
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
    commit(join(parent, 'a'), 'A');
    writeFile(join(parent, 'b'), 'src/b.ts', 'export const b = 1;\nexport const c = 2;\n');
    await Promise.all([a.impact(), b.impact()]);
    expect(viewsOf(a).map((v) => v.title)).toEqual(['Whole branch', 'A', 'Uncommitted changes']);
    expect(viewsOf(b).map((v) => [v.title, v.stats?.additions])).toEqual([
      ['Whole branch', 2],
      ['Uncommitted changes', 2],
    ]);
    expect(a.map.index(0)).not.toContain('src/b.ts');
    expect(b.map.index(0)).not.toContain('src/a.ts');
    const refs = runGit(repo, 'for-each-ref', '--format=%(refname)', 'refs/dyffle');
    expect(refs.trim().split('\n').sort()).toEqual(['refs/dyffle/worktrees/a/live', 'refs/dyffle/worktrees/b/live']);
    expect(readdirSync(join(parent, 'cache'))).toHaveLength(1);
  });
});

describe('the viewer', () => {
  it('serves the page without web fonts', () => {
    const html = review.viewerHtml();
    expect(html).toContain('<script>');
    expect(html).not.toContain('fonts.googleapis');
  });
});
