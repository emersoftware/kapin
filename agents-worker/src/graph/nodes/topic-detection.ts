/**
 * Topic Detection Node
 *
 * This node runs the topic detection agent to identify up to 3 main topics/features
 * in the codebase.
 */

import type { GraphState, Env } from "../../types";
import { E2BSandboxClient } from "../../services/e2b-sandbox-client";
import { createTopicDetectionAgent } from "../../agents/topic-detection-agent";

export async function topicDetectionNode(
  state: GraphState,
  config: { env: Env; sandboxClient: E2BSandboxClient }
): Promise<Partial<GraphState>> {
  console.log("[NODE] Topic Detection - Starting...");

  const { env, sandboxClient } = config;
  const { projectId } = state;

  try {
    // Create topic detection agent
    const agent = createTopicDetectionAgent(env, sandboxClient);

    // Invoke agent
    const result = await agent.invoke(
      {
        messages: [{
          role: "user",
          content: `Analyze the codebase in the current directory and detect the top 3 main topics/features.
          The repositories are cloned in the current directory (use 'ls' to see them).
          Focus on user-facing features and business functionality.
          Return a structured list of topics with their names, descriptions, and related files.`
        }]
      },
      {
        context: { projectId },
        recursionLimit: 50,
      }
    );

    console.log(`[NODE] Topic Detection - Detected ${result.structuredResponse.topics.length} topics`);

    // Log detected topics
    result.structuredResponse.topics.forEach((topic, index) => {
      console.log(`[NODE] Topic ${index + 1}: ${topic.name}`);
    });

    // Return updated state
    return {
      topics: result.structuredResponse.topics,
    };

  } catch (error) {
    console.error("[NODE] Topic Detection - Error:", error);

    return {
      topics: [],
      errors: [error instanceof Error ? error.message : "Unknown error in topic detection"],
    };
  }
}
