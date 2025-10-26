/**
 * Generate Metrics Node
 *
 * Worker node that generates metrics for a single topic.
 * Multiple instances run in parallel, one for each topic.
 */

import type { GraphState, Env, Topic, Metric } from "../../types";
import { E2BSandboxClient } from "../../services/e2b-sandbox-client";
import { createMetricGeneratorAgent } from "../../agents/metric-generator-agent";
import { saveMetricsProgressively } from "./save-metrics-helper";

/**
 * Worker node: Generates metrics for a single topic
 */
export async function generateMetricsForTopic(
  state: GraphState & { currentTopic: Topic },
  config: { env: Env; sandboxClient: E2BSandboxClient }
): Promise<Partial<GraphState>> {
  const { env, sandboxClient } = config;
  const { projectId, currentTopic } = state;

  console.log(`[NODE] Generate Metrics - Processing topic: ${currentTopic.name}`);

  try {
    // Create metric generator agent
    const agent = createMetricGeneratorAgent(env, sandboxClient);

    // Invoke agent with the specific topic
    const result = await agent.invoke(
      {
        messages: [{
          role: "user",
          content: `Generate 1-3 high-value product metrics for the following topic:

Topic Name: ${currentTopic.name}
Description: ${currentTopic.description}
Related Files: ${currentTopic.relatedFiles.join(", ")}

Focus on metrics that:
1. Provide actionable business insights
2. Are easy to instrument
3. Help understand user behavior for this feature

Read the related files to understand the implementation and suggest realistic metrics.`
        }]
      },
      {
        context: {
          projectId,
          topic: currentTopic,
        },
        recursionLimit: 50,
      }
    );

    console.log(`[NODE] Generate Metrics - Generated ${result.structuredResponse.metrics.length} metrics for ${currentTopic.name}`);

    // Log generated metrics
    result.structuredResponse.metrics.forEach((metric, index) => {
      console.log(`[NODE] Metric ${index + 1}: ${metric.name}`);
    });

    // PROGRESSIVE SAVE: Save metrics immediately for faster user feedback
    if (state.runId && result.structuredResponse.metrics.length > 0) {
      await saveMetricsProgressively(
        state.runId,
        projectId,
        result.structuredResponse.metrics,
        env
      );
    }

    // Return metrics (will be accumulated by reducer in allMetrics)
    return {
      allMetrics: result.structuredResponse.metrics,
    };

  } catch (error) {
    console.error(`[NODE] Generate Metrics - Error for topic ${currentTopic.name}:`, error);

    return {
      allMetrics: [],
      errors: [error instanceof Error ? error.message : `Unknown error generating metrics for ${currentTopic.name}`],
    };
  }
}
