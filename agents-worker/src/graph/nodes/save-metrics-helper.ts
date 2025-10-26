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
 * Saves a single metric to the database via web-worker callback
 *
 * This enables TRUE progressive feedback - metrics appear one-by-one in the UI
 * instead of arriving in batches.
 *
 * @param runId - The run ID
 * @param projectId - The project ID
 * @param metric - Single metric to save
 * @param env - Environment variables (contains WEB_WORKER_URL)
 * @returns true if successful, false otherwise
 */
export async function saveMetricImmediately(
  runId: string,
  projectId: string,
  metric: Metric,
  env: Env
): Promise<boolean> {
  if (!metric) {
    console.log('[SAVE-HELPER] No metric to save, skipping');
    return true;
  }

  if (!env.WEB_WORKER_URL) {
    console.error('[SAVE-HELPER] WEB_WORKER_URL not configured, cannot save metric');
    return false;
  }

  try {
    console.log(`[SAVE-HELPER] Saving metric "${metric.name}" for runId: ${runId}`);

    // Transform Metric to ProductMetric format expected by web-worker
    const metricToSave: ProductMetric = {
      title: metric.name,
      description: metric.description,
      featureName: metric.featureName,
      metricType: metric.metricType,
      sqlQuery: metric.sqlQuery,
      metadata: {
        relatedFiles: metric.relatedFiles || []
      }
    };

    // Send HTTP POST to web-worker (array of 1 metric to maintain API compatibility)
    const response = await fetch(`${env.WEB_WORKER_URL}/api/agent/metrics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        runId,
        projectId,
        metrics: [metricToSave], // Array of 1 for API compatibility
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[SAVE-HELPER] ❌ Failed to save metric: ${response.status} - ${errorText}`);
      return false;
    }

    console.log(`[SAVE-HELPER] ✅ Successfully saved metric "${metric.name}"`);
    return true;

  } catch (error) {
    // Log error but don't throw - workflow should continue even if save fails
    console.error(`[SAVE-HELPER] ❌ Error saving metric "${metric.name}":`, error);
    return false;
  }
}

/**
 * Legacy function name for backward compatibility
 * Now saves metrics one-by-one with a small delay for better UX
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

  console.log(`[SAVE-HELPER] Saving ${metrics.length} metrics progressively (one-by-one)`);

  let successCount = 0;
  for (const metric of metrics) {
    const success = await saveMetricImmediately(runId, projectId, metric, env);
    if (success) successCount++;

    // Small delay for smoother UX (metrics appear one-by-one)
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log(`[SAVE-HELPER] Saved ${successCount}/${metrics.length} metrics successfully`);
  return successCount > 0;
}
