import { DomainEvent } from '@drums/protocol';

export interface LiveHandlers {
  onEvent(event: DomainEvent): void;
  /** The stream (re)connected: anything may have been missed, so reload. */
  onConnect(): void;
}

/** The live-update subscription of one workspace. Returns how to end it. */
export function subscribe(ws: string, { onEvent, onConnect }: LiveHandlers): () => void {
  const source = new EventSource(`/api/workspaces/${encodeURIComponent(ws)}/stream`);
  source.addEventListener('ready', onConnect);
  source.onmessage = (message: MessageEvent<string>) => {
    const parsed = DomainEvent.safeParse(JSON.parse(message.data));
    if (parsed.success) onEvent(parsed.data);
  };
  return () => source.close();
}
