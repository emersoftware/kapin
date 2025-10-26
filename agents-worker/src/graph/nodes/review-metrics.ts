/**
 * Review Metrics Node
 *
 * Worker node that reviews a single metric.
 * Multiple instances run in parallel, one for each metric.
 */

import type { GraphState, Env, Metric, Review } from "../../types";
import { createMetricReviewerAgent } from "../../agents/metric-reviewer-agent";

/**
 * Worker node: Reviews a single metric
 */
export async function reviewSingleMetric(
  state: GraphState & { currentMetric: Metric; currentMetricIndex: number },
  config: { env: Env }
): Promise<Partial<GraphState>> {
  const { env } = config;
  const { currentMetric, currentMetricIndex } = state;

  console.log(`[NODE] Review Metric - Processing metric ${currentMetricIndex + 1}: ${currentMetric.name}`);

  try {
    // Create metric reviewer agent
    const agent = createMetricReviewerAgent(env);

    // Invoke agent with the specific metric
    const result = await agent.invoke(
      {
        messages: [{
          role: "user",
          content: `Review the following product metric and decide if it should be approved:

Metric Name: ${currentMetric.name}
Description: ${currentMetric.description}
Feature Name: ${currentMetric.featureName}
Metric Type: ${currentMetric.metricType}
SQL Query: ${currentMetric.sqlQuery}
Related Files: ${currentMetric.relatedFiles.join(", ")}

Evaluate based on:
1. Business Value - Does it provide actionable insights?
2. Instrumentation Ease - Is it realistic to implement?
3. Clarity - Is it clear and understandable?

Provide your decision (approved: true/false) with clear reasoning.`
        }]
      },
      {
        context: {
          metric: currentMetric,
        },
        recursionLimit: 10, // Review doesn't need many iterations
      }
    );

    const review = result.structuredResponse;
    const status = review.approved ? "✅ APPROVED" : "❌ REJECTED";
    console.log(`[NODE] Review Metric - ${status}: ${currentMetric.name}`);
    console.log(`[NODE] Reasoning: ${review.reasoning}`);

    // Return review (will be accumulated by reducer in reviews)
    return {
      reviews: review,
    };

  } catch (error) {
    console.error(`[NODE] Review Metric - Error for metric ${currentMetric.name}:`, error);

    // If review fails, default to rejecting the metric
    return {
      reviews: {
        approved: false,
        reasoning: `Review failed due to error: ${error instanceof Error ? error.message : "Unknown error"}`,
      },
      errors: [error instanceof Error ? error.message : `Unknown error reviewing metric ${currentMetric.name}`],
    };
  }
}
