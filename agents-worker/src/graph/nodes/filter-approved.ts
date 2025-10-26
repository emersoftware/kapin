/**
 * Filter Approved Metrics Node
 *
 * This node filters metrics to keep only those that were approved by reviewers.
 * It matches metrics with their reviews by index and creates the final output.
 */

import type { GraphState, Metric } from "../../types";

export function filterApprovedNode(state: GraphState): Partial<GraphState> {
  console.log("[NODE] Filter Approved - Starting...");
  console.log(`[NODE] Total metrics: ${state.allMetrics.length}`);
  console.log(`[NODE] Total reviews: ${state.reviews.length}`);

  // Filter metrics where the corresponding review is approved
  const approvedMetrics: Metric[] = [];

  state.allMetrics.forEach((metric, index) => {
    const review = state.reviews[index];

    if (review && review.approved) {
      approvedMetrics.push(metric);
      console.log(`[NODE] ✅ Approved: ${metric.name}`);
    } else if (review) {
      console.log(`[NODE] ❌ Rejected: ${metric.name}`);
      console.log(`[NODE]    Reason: ${review.reasoning}`);
    } else {
      console.log(`[NODE] ⚠️  No review found for: ${metric.name}`);
    }
  });

  console.log(`[NODE] Filter Approved - ${approvedMetrics.length}/${state.allMetrics.length} metrics approved`);

  return {
    approvedMetrics,
  };
}
