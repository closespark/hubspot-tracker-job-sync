import { ProcessedEvent } from '../types/index.js';

// In-memory store for idempotency tracking
// In production, this should be replaced with a persistent store (Redis, Database, etc.)
class IdempotencyStore {
  private store: Map<string, ProcessedEvent> = new Map();
  private maxSize: number = 10000;

  async hasProcessed(eventId: string): Promise<boolean> {
    return this.store.has(eventId);
  }

  async markAsProcessed(eventId: string, status: 'success' | 'failed', error?: string): Promise<void> {
    // Prevent memory overflow by removing oldest entries
    if (this.store.size >= this.maxSize) {
      const firstKey = this.store.keys().next().value;
      if (firstKey) {
        this.store.delete(firstKey);
      }
    }

    this.store.set(eventId, {
      eventId,
      processedAt: new Date(),
      status,
      error,
    });
  }

  async getProcessedEvent(eventId: string): Promise<ProcessedEvent | null> {
    return this.store.get(eventId) || null;
  }
}

export const idempotencyStore = new IdempotencyStore();
