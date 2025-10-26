/**
 * Multi-Agent Workflow
 *
 * Orchestrates the complete metric detection pipeline:
 * 1. Topic Detection + Top Metrics Generation (parallel from START)
 * 2. Metric Generation by Topic (parallel per topic, after step 1)
 * 3. Filter & Combine Results (sequential)
 */

import { StateGraph, START, END, Send } from "@langchain/langgraph";
import type { GraphState, Env } from "../types";
import { GraphStateSchema } from "../types";
import { E2BSandboxClient } from "../services/e2b-sandbox-client";

// Import nodes
import { topicDetectionNode } from "./nodes/topic-detection";
import { generateTopMetricsNode } from "./nodes/generate-top-metrics";
import { generateMetricsForTopic } from "./nodes/generate-metrics";
import { filterApprovedNode } from "./nodes/filter-approved";

/**
 * Configure LangSmith tracing globally (if enabled)
 */
function configureLangSmithTracing(env: Env) {
  if (env.LANGSMITH_TRACING === "true" && env.LANGSMITH_API_KEY) {
    console.log("[WORKFLOW] LangSmith tracing enabled for project:", env.LANGSMITH_PROJECT);
    process.env.LANGCHAIN_TRACING_V2 = "true";
    process.env.LANGCHAIN_ENDPOINT = env.LANGSMITH_ENDPOINT || "https://api.smith.langchain.com";
    process.env.LANGCHAIN_API_KEY = env.LANGSMITH_API_KEY;
    process.env.LANGCHAIN_PROJECT = env.LANGSMITH_PROJECT || "default";
  } else {
    console.log("[WORKFLOW] LangSmith tracing disabled");
  }
}

/**
 * Creates the complete multi-agent workflow
 */
export function createWorkflow(env: Env, sandboxClient: E2BSandboxClient) {
  // Configure LangSmith once for the entire workflow
  configureLangSmithTracing(env);

  // Create graph with state schema (Zod v4)
  const graph = new StateGraph(GraphStateSchema);

  // Add nodes
  graph.addNode("topic_detection", async (state: GraphState) => {
    return await topicDetectionNode(state, { env, sandboxClient });
  });

  graph.addNode("generate_top_metrics", async (state: GraphState) => {
    return await generateTopMetricsNode(state, { env, sandboxClient });
  });

  graph.addNode("generate_metrics_for_topic", async (state: any) => {
    return await generateMetricsForTopic(state, { env, sandboxClient });
  });

  graph.addNode("filter_approved", filterApprovedNode);

  // Step 1: FROM START -> Launch topic_detection and generate_top_metrics in PARALLEL
  graph.addConditionalEdges(
    START,
    (state: GraphState) => {
      console.log(`[WORKFLOW] Launching parallel tasks: topic_detection + generate_top_metrics`);
      return [
        new Send("topic_detection", state),
        new Send("generate_top_metrics", state),
      ];
    }
  );

  // Step 2: FROM topic_detection -> Launch generate_metrics_for_topic (parallel per topic)
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

  // Step 3: FROM generate_top_metrics -> Go directly to filter_approved
  graph.addEdge("generate_top_metrics", "filter_approved");

  // Step 4: FROM generate_metrics_for_topic -> Go to filter_approved
  graph.addEdge("generate_metrics_for_topic", "filter_approved");

  // Step 5: FROM filter_approved -> END
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
  console.log(`[WORKFLOW] Generated ${result.topMetrics?.length || 0} top priority metrics`);
  console.log(`[WORKFLOW] Generated ${result.allMetrics?.length || 0} metrics by topic`);
  console.log(`[WORKFLOW] Total approved ${result.approvedMetrics?.length || 0} metrics`);

  return result;
}
