import type { AgentBackend, AgentEvent, AgentSessionOptions } from '@drums/core';

/** A backend a test scripts by hand. The real model is never reached. */
export function fakeBackend() {
  const sessions: Array<{ options: AgentSessionOptions; received: string[]; emit(event: AgentEvent): void }> = [];
  const open = async (options: AgentSessionOptions) => {
    const queue: AgentEvent[] = [];
    let wake = () => {};
    let closed = false;
    const session = {
      options,
      received: [] as string[],
      emit(event: AgentEvent) {
        queue.push(event);
        wake();
      },
    };
    sessions.push(session);
    async function* events(): AsyncGenerator<AgentEvent> {
      while (!closed) {
        const event = queue.shift();
        if (event) yield event;
        else await new Promise<void>((resolve) => (wake = resolve));
      }
    }
    return {
      events: events(),
      send: async (text: string) => void session.received.push(text),
      interrupt: async () => session.emit({ type: 'turn.ended', outcome: 'error', error: 'interrupted' }),
      close() {
        closed = true;
        wake();
      },
    };
  };
  const backend: AgentBackend = { start: open, resume: (_id, options) => open(options) };
  return { backend, sessions };
}
