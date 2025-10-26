/**
 * Filter Approved Metrics Node
 *
 * Combines all generated metrics (top priority + by topic) into final output.
 * Since we removed the review step, all metrics are automatically approved.
 */

import type { GraphState, Metric } from "../../types";

export function filterApprovedNode(state: GraphState): Partial<GraphState> {
  console.log("[NODE] Filter Approved - Starting...");
  console.log(`[NODE] Top priority metrics: ${state.topMetrics.length}`);
  console.log(`[NODE] Metrics by topic: ${state.allMetrics.length}`);

  // Combine all metrics: top priority + by topic
  const approvedMetrics: Metric[] = [
    ...state.topMetrics,
    ...state.allMetrics,
  ];

  console.log(`[NODE] Filter Approved - Combined ${approvedMetrics.length} total metrics`);

  // Log all metrics
  console.log(`[NODE] === TOP PRIORITY METRICS ===`);
  state.topMetrics.forEach((metric, index) => {
    console.log(`[NODE] ${index + 1}. ${metric.name}`);
  });

  console.log(`[NODE] === METRICS BY TOPIC ===`);
  state.allMetrics.forEach((metric, index) => {
    console.log(`[NODE] ${index + 1}. ${metric.name} (${metric.featureName})`);
  });

  return {
    approvedMetrics,
  };
}
