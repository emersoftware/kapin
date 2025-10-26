/**
 * Multi-Agent Workflow
 *
 * Orchestrates the complete metric detection pipeline:
 * 1. Topic Detection (sequential)
 * 2. Metric Generation (parallel per topic)
 * 3. Metric Review (parallel per metric)
 * 4. Filter Approved Metrics (sequential)
 */

import { StateGraph, START, END, Send } from "@langchain/langgraph";
import type { GraphState, Env } from "../types";
import { GraphStateSchema } from "../types";
import { E2BSandboxClient } from "../services/e2b-sandbox-client";

// Import nodes
import { topicDetectionNode } from "./nodes/topic-detection";
import { generateMetricsForTopic } from "./nodes/generate-metrics";
import { reviewSingleMetric } from "./nodes/review-metrics";
import { filterApprovedNode } from "./nodes/filter-approved";

/**
 * Creates the complete multi-agent workflow
 */
export function createWorkflow(env: Env, sandboxClient: E2BSandboxClient) {
  // Create graph with state schema (Zod v4)
  const graph = new StateGraph(GraphStateSchema);

  // Add nodes
  graph.addNode("topic_detection", async (state: GraphState) => {
    return await topicDetectionNode(state, { env, sandboxClient });
  });

  graph.addNode("generate_metrics_for_topic", async (state: any) => {
    return await generateMetricsForTopic(state, { env, sandboxClient });
  });

  graph.addNode("review_single_metric", async (state: any) => {
    return await reviewSingleMetric(state, { env });
  });

  graph.addNode("filter_approved", filterApprovedNode);

  // Add edges
  graph.addEdge(START, "topic_detection");

  // Conditional edge: topic_detection -> generate_metrics_for_topic (parallel via Send)
  graph.addConditionalEdges(
    "topic_detection",
    (state: GraphState) => {
      console.log(`[WORKFLOW] Creating ${state.topics.length} parallel metric generation tasks`);
      // Use Send API to create parallel tasks for each topic
      return state.topics.map((topic) =>
        new Send("generate_metrics_for_topic", {
          ...state,
          currentTopic: topic,
        })
      );
    }
  );

  // Conditional edge: generate_metrics_for_topic -> review_single_metric (parallel via Send)
  graph.addConditionalEdges(
    "generate_metrics_for_topic",
    (state: GraphState) => {
      console.log(`[WORKFLOW] Creating ${state.allMetrics.length} parallel review tasks`);
      // Use Send API to create parallel tasks for each metric
      return state.allMetrics.map((metric, index) =>
        new Send("review_single_metric", {
          ...state,
          currentMetric: metric,
          currentMetricIndex: index,
        })
      );
    }
  );

  // Regular edge: review_single_metric -> filter_approved
  graph.addEdge("review_single_metric", "filter_approved");

  // Regular edge: filter_approved -> END
  graph.addEdge("filter_approved", END);

  // Compile graph
  const workflow = graph.compile();

  console.log("[WORKFLOW] Multi-agent workflow created successfully");

  return workflow;
}

/**
 * Invokes the workflow with initial state
 */
export async function runWorkflow(
  env: Env,
  sandboxClient: E2BSandboxClient,
  initialState: Partial<GraphState>
) {
  console.log("[WORKFLOW] Starting workflow execution...");

  const workflow = createWorkflow(env, sandboxClient);

  const result = await workflow.invoke(initialState);

  console.log("[WORKFLOW] Workflow execution completed");
  console.log(`[WORKFLOW] Detected ${result.topics?.length || 0} topics`);
  console.log(`[WORKFLOW] Generated ${result.allMetrics?.length || 0} total metrics`);
  console.log(`[WORKFLOW] Approved ${result.approvedMetrics?.length || 0} metrics`);

  return result;
}
