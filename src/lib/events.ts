type EventListener = (event: SSEEvent) => void;

export interface SSEEvent {
  id?: string;
  type: string;
  campaignId?: string | null;
  campaignName?: string;
  message: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

class EventBus {
  private listeners: Set<EventListener> = new Set();

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  publish(event: SSEEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // listener errored, ignore
      }
    }
  }

  get subscriberCount(): number {
    return this.listeners.size;
  }
}

const globalForEvents = globalThis as unknown as {
  eventBus: EventBus | undefined;
};

export const eventBus = globalForEvents.eventBus ?? new EventBus();

if (process.env.NODE_ENV !== "production") globalForEvents.eventBus = eventBus;
