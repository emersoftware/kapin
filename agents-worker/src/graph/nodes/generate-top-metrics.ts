/**
 * Generate Top Metrics Node
 *
 * Generates the 3 most important product metrics from the entire codebase.
 * Runs in parallel with topic detection.
 */

import type { GraphState, Env } from "../../types";
import { E2BSandboxClient } from "../../services/e2b-sandbox-client";
import { createTopMetricsAgent } from "../../agents/top-metrics-agent";
import { saveMetricsProgressively } from "./save-metrics-helper";

/**
 * Node: Generates top 3 priority metrics
 */
export async function generateTopMetricsNode(
  state: GraphState,
  config: { env: Env; sandboxClient: E2BSandboxClient }
): Promise<Partial<GraphState>> {
  const { env, sandboxClient } = config;
  const { projectId } = state;

  console.log(`[NODE] Generate Top Metrics - Starting analysis`);

  try {
    // Create top metrics agent
    const agent = createTopMetricsAgent(env, sandboxClient);

    // Invoke agent to generate top 3 metrics
    const result = await agent.invoke(
      {
        messages: [{
          role: "user",
          content: `Analyze this codebase and generate the 3 MOST IMPORTANT product metrics.

Focus on metrics that:
1. Provide the HIGHEST business value and actionable insights
2. Measure critical user behaviors or business outcomes
3. Are feasible to implement and track

Explore the codebase structure, read key files (package.json, main routes, components), and identify the 3 metrics that would have the biggest impact on understanding product performance.

Generate EXACTLY 3 metrics (no more, no less).`
        }]
      },
      {
        context: {
          projectId,
        },
        recursionLimit: 100,
      }
    );

    const topMetrics = result.structuredResponse.metrics;

    console.log(`[NODE] Generate Top Metrics - Generated ${topMetrics.length} priority metrics`);

    // Log generated metrics
    topMetrics.forEach((metric, index) => {
      console.log(`[NODE] Top Metric ${index + 1}: ${metric.name}`);
    });

    // PROGRESSIVE SAVE: Save metrics immediately for faster user feedback
    if (state.runId && topMetrics.length > 0) {
      await saveMetricsProgressively(state.runId, projectId, topMetrics, env);
    }

    // Return top metrics (will be accumulated by reducer)
    return {
      topMetrics,
    };

  } catch (error) {
    console.error(`[NODE] Generate Top Metrics - Error:`, error);

    return {
      topMetrics: [],
      errors: [error instanceof Error ? error.message : "Unknown error generating top metrics"],
    };
  }
}
