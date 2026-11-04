import { describe, expect, it } from 'vitest';
import { DomainEvent, HealthResponse } from './index.js';

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
});
