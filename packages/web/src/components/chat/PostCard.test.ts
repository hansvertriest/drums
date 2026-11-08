import type { Post } from '@drums/protocol';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAgents } from '../../stores/agents';
import PostCard from './PostCard.vue';

const at = '2026-01-01T10:00:00.000Z';
const base = { kind: 'handover', seq: 1, at, instruction: 'Check **it**' } as const;

describe('a handover in the thread', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useAgents().load([
      { id: 'from', role: 'scoper', name: 'Scoper', status: 'idle' },
      { id: 'to', role: 'reviewer', name: 'Reviewer', status: 'running' },
    ]);
  });

  it.each<[string, Post]>([
    ['the sender', { ...base, agent: 'from', peer: 'to', direction: 'sent' }],
    ['the receiver', { ...base, agent: 'to', peer: 'from', direction: 'received' }],
  ])("names who handed to whom in %s's thread", (_side, post) => {
    const card = mount(PostCard, { props: { post } });
    expect(card.find('.by').text()).toBe('Scoper');
    expect(card.find('h3').text()).toBe('Handed over to Reviewer');
    expect(card.find('.md').html()).toContain('<b>it</b>');
  });
});
