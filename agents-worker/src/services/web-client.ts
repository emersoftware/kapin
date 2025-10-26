import type { Fetcher } from '@cloudflare/workers-types';
import type { ProductMetric } from '../types';

/**
 * Client for making callbacks to web-worker
 * Sends progress updates, metrics, and completion status
 */
export class WebClient {
  constructor(private binding: Fetcher) {}

  /**
   * Send a progress update message
   */
  async sendProgress(runId: string, message: string): Promise<void> {
    try {
      await this.binding.fetch(
        new Request(`http://fake/api/agent/progress`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ runId, message }),
        })
      );
    } catch (error) {
      console.error('Failed to send progress:', error);
      // Don't throw - progress updates are not critical
    }
  }

  /**
   * Send a generated metric to be saved in the database
   */
  async sendMetric(runId: string, metric: ProductMetric): Promise<void> {
    try {
      await this.binding.fetch(
        new Request(`http://fake/api/agent/metrics`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ runId, metric }),
        })
      );
    } catch (error) {
      console.error('Failed to send metric:', error);
      throw error; // Metrics are critical, propagate error
    }
  }

  /**
   * Mark the run as completed or failed
   */
  async sendComplete(runId: string, status: 'completed' | 'failed'): Promise<void> {
    try {
      await this.binding.fetch(
        new Request(`http://fake/api/agent/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ runId, status }),
        })
      );
    } catch (error) {
      console.error('Failed to send completion:', error);
      // Best effort - don't throw
    }
  }

  /**
   * Send an error message
   */
  async sendError(runId: string, error: string): Promise<void> {
    try {
      await this.binding.fetch(
        new Request(`http://fake/api/agent/error`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ runId, error }),
        })
      );
    } catch (err) {
      console.error('Failed to send error:', err);
      // Best effort - don't throw
    }
  }
}
