import type { AgentStatusEvent } from '@drums/protocol';
import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from './event-bus.js';

const event: AgentStatusEvent = { type: 'agent.status', workspace: 'w1', agent: 'a1', status: 'running' };

describe('createEventBus', () => {
  it('delivers an event to listeners of its type and to onAny', () => {
    const bus = createEventBus();
    const typed = vi.fn();
    const any = vi.fn();
    bus.on('agent.status', typed);
    bus.onAny(any);
    bus.emit(event);
    expect(typed).toHaveBeenCalledWith(event);
    expect(any).toHaveBeenCalledWith(event);
  });

  it('stops delivering after unsubscribe', () => {
    const bus = createEventBus();
    const listener = vi.fn();
    bus.on('agent.status', listener)();
    bus.emit(event);
    expect(listener).not.toHaveBeenCalled();
  });

  it('keeps separate buses separate', () => {
    const listener = vi.fn();
    createEventBus().onAny(listener);
    createEventBus().emit(event);
    expect(listener).not.toHaveBeenCalled();
  });
});
