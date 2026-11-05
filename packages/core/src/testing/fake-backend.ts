import type { AgentBackend, AgentEvent, AgentSession, AgentSessionOptions } from '../ports/agent-backend.js';

/** An `AgentBackend` a test drives by hand: it decides what the model "does". */
export interface FakeSession extends AgentSession {
  options: AgentSessionOptions;
  resumedFrom?: string;
  received: string[];
  interrupted: number;
  answers: Array<{ id: string; decision: string }>;
  emit(event: AgentEvent): void;
  end(error?: Error): void;
  /** Calls one of the session's bound tools, the way the model would. */
  tool(id: string, args: unknown): ReturnType<AgentSessionOptions['tools'][number]['call']>;
}

function createFakeSession(options: AgentSessionOptions, resumedFrom?: string): FakeSession {
  const queue: AgentEvent[] = [];
  let wake: (() => void) | undefined;
  let ended = false;
  let failure: Error | undefined;

  async function* events(): AsyncGenerator<AgentEvent> {
    for (;;) {
      const event = queue.shift();
      if (event) {
        yield event;
        continue;
      }
      if (failure) throw failure;
      if (ended) return;
      await new Promise<void>((resolve) => (wake = resolve));
    }
  }

  const session: FakeSession = {
    options,
    ...(resumedFrom ? { resumedFrom } : {}),
    received: [],
    interrupted: 0,
    answers: [],
    events: events(),
    send: async (message) => void session.received.push(message),
    interrupt: async () => void (session.interrupted += 1),
    async respondPermission(id, decision) {
      session.answers.push({ id, decision });
      return true;
    },
    close: () => session.end(),
    emit(event) {
      queue.push(event);
      wake?.();
    },
    end(error) {
      ended = true;
      failure = error;
      wake?.();
    },
    tool(id, args) {
      const tool = options.tools.find((t) => t.id === id);
      if (!tool) throw new Error(`The session has no tool ${id}`);
      return tool.call(args);
    },
  };
  return session;
}

export function createFakeBackend(): AgentBackend & { sessions: FakeSession[]; last(): FakeSession } {
  const sessions: FakeSession[] = [];
  const open = (options: AgentSessionOptions, resumedFrom?: string) => {
    const session = createFakeSession(options, resumedFrom);
    sessions.push(session);
    return session;
  };
  return {
    sessions,
    last() {
      const session = sessions.at(-1);
      if (!session) throw new Error('No session started');
      return session;
    },
    start: async (options) => open(options),
    resume: async (sessionId, options) => open(options, sessionId),
  };
}
