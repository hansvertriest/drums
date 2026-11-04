import type { DomainEvent } from '@drums/protocol';

export type DomainEventType = DomainEvent['type'];
export type DomainEventOf<T extends DomainEventType> = Extract<DomainEvent, { type: T }>;
export type Unsubscribe = () => void;

export interface EventBus {
  emit(event: DomainEvent): void;
  on<T extends DomainEventType>(type: T, listener: (event: DomainEventOf<T>) => void): Unsubscribe;
  /** Every event, for the HTTP stream. */
  onAny(listener: (event: DomainEvent) => void): Unsubscribe;
}

export function createEventBus(): EventBus {
  const listeners = new Set<(event: DomainEvent) => void>();

  const onAny: EventBus['onAny'] = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  return {
    emit(event) {
      for (const listener of [...listeners]) listener(event);
    },
    on(type, listener) {
      return onAny((event) => {
        if (event.type === type) listener(event as DomainEventOf<typeof type>);
      });
    },
    onAny,
  };
}
