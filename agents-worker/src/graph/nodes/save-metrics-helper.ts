/**
 * Helper function to save metrics progressively during workflow execution
 *
 * This enables faster user feedback in the onboarding flow by saving metrics
 * immediately after generation instead of waiting for the entire workflow to complete.
 */

import type { Env, Metric } from "../../types";

export interface ProductMetric {
  title: string;
  description: string;
  featureName: string;
  metricType: string;
  sqlQuery: string;
  metadata?: {
    relatedFiles?: string[];
  };
}

/**
 * Saves metrics to the database via web-worker callback
 *
 * @param runId - The run ID
 * @param projectId - The project ID
 * @param metrics - Array of metrics to save
 * @param env - Environment variables (contains WEB_WORKER_URL)
 * @returns true if successful, false otherwise
 */
export async function saveMetricsProgressively(
  runId: string,
  projectId: string,
  metrics: Metric[],
  env: Env
): Promise<boolean> {
  if (!metrics || metrics.length === 0) {
    console.log('[SAVE-HELPER] No metrics to save, skipping');
    return true;
  }

  if (!env.WEB_WORKER_URL) {
    console.error('[SAVE-HELPER] WEB_WORKER_URL not configured, cannot save metrics');
    return false;
  }

  try {
    console.log(`[SAVE-HELPER] Saving ${metrics.length} metrics for runId: ${runId}`);

    // Transform Metric[] to ProductMetric[] format expected by web-worker
    const metricsToSave: ProductMetric[] = metrics.map((metric) => ({
      title: metric.name,
      description: metric.description,
      featureName: metric.featureName,
      metricType: metric.metricType,
      sqlQuery: metric.sqlQuery,
      metadata: {
        relatedFiles: metric.relatedFiles || []
      }
    }));

    // Send HTTP POST to web-worker
    const response = await fetch(`${env.WEB_WORKER_URL}/api/agent/metrics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        runId,
        projectId,
        metrics: metricsToSave,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[SAVE-HELPER] ❌ Failed to save metrics: ${response.status} - ${errorText}`);
      return false;
    }

    const result = await response.json();
    console.log(`[SAVE-HELPER] ✅ Successfully saved ${result.count || metrics.length} metrics`);
    return true;

  } catch (error) {
    // Log error but don't throw - workflow should continue even if save fails
    console.error('[SAVE-HELPER] ❌ Error saving metrics progressively:', error);
    return false;
  }
}
