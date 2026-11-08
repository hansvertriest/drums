import { describe, expect, it } from 'vitest';
import { CreateWorkspaceRequest, DomainEvent, HealthResponse, ImageName, ImageType, MAX_IMAGE_BYTES, MAX_IMAGES, MAX_MESSAGE_BODY_BYTES, Post, WorkspaceId, imageExtension, imageTypeOf, parseFrameMessage } from './index.js';

describe('protocol schemas', () => {
  it('accepts a known domain event and rejects an unknown type', () => {
    const event = { type: 'agent.status', workspace: 'w1', agent: 'a1', status: 'running' };
    expect(DomainEvent.parse(event)).toEqual(event);
    expect(DomainEvent.safeParse({ ...event, type: 'nope' }).success).toBe(false);
  });

  it('rejects a health response without a valid time', () => {
    const body = { status: 'ok', time: 'soon', roles: [], tools: [], artifactKinds: [] };
    expect(HealthResponse.safeParse(body).success).toBe(false);
  });

  it('keeps ids that reach file paths out of parent folders', () => {
    for (const id of ['../etc', 'a/b', '.hidden', '', 'a b']) expect(WorkspaceId.safeParse(id).success).toBe(false);
    expect(WorkspaceId.safeParse('checkout-v2-1f3a').success).toBe(true);
  });

  it('tells post kinds apart', () => {
    const at = new Date().toISOString();
    const note = { kind: 'note', seq: 1, agent: 'a1', at, title: 't', message: 'm' };
    expect(Post.parse(note)).toEqual(note);
    expect(Post.safeParse({ ...note, kind: 'version' }).success).toBe(false);
  });
});

describe('CreateWorkspaceRequest', () => {
  const agents = [{ role: 'coder', instruction: 'Fix it' }];

  it('takes agents and a title, and needs neither', () => {
    expect(CreateWorkspaceRequest.parse({ goal: 'g', title: ' T ', agents })).toEqual({ goal: 'g', repos: [], title: 'T', agents });
    expect(CreateWorkspaceRequest.parse({ goal: 'g' })).toEqual({ goal: 'g', repos: [] });
  });

  it.each([
    ['no agents', { agents: [] }],
    ['an empty instruction', { agents: [{ role: 'coder', instruction: '  ' }] }],
    ['no role', { agents: [{ instruction: 'x' }] }],
    ['an empty title', { title: '  ' }],
  ])('refuses %s', (_name, fields) => {
    expect(CreateWorkspaceRequest.safeParse({ goal: 'g', ...fields }).success).toBe(false);
  });
});

describe('parseFrameMessage', () => {
  it('takes well-formed messages', () => {
    expect(parseFrameMessage({ source: 'drums-artifact', type: 'ready' })?.type).toBe('ready');
    const answers = [{ name: 'q', label: 'Q', value: 'x' }];
    expect(parseFrameMessage({ source: 'drums-artifact', type: 'answers', answers })).toMatchObject({ answers });
  });

  it('drops everything else, an untrusted frame sent it', () => {
    const bad: unknown[] = [
      null,
      'ready',
      { type: 'ready' },
      { source: 'drums-artifact', type: 'navigate', url: 'https://x' },
      { source: 'drums-artifact', type: 'answers', answers: [{ name: 'q' }] },
      { source: 'drums-artifact', type: 'answers', answers: [{ name: 'q', label: 'Q', value: 'x'.repeat(20_001) }] },
    ];
    for (const data of bad) expect(parseFrameMessage(data)).toBeUndefined();
  });
});

describe('images', () => {
  it('has one table for types, names and limits', () => {
    for (const type of ImageType.options) {
      const name = `abc.${imageExtension(type)}`;
      expect(ImageName.safeParse(name).success).toBe(true);
      expect(imageTypeOf(name)).toBe(type);
    }
    expect(ImageName.safeParse('../x.png').success).toBe(false);
    expect(ImageName.safeParse('x.svg').success).toBe(false);
    expect(MAX_MESSAGE_BODY_BYTES).toBeGreaterThan(MAX_IMAGES * MAX_IMAGE_BYTES);
  });
});
