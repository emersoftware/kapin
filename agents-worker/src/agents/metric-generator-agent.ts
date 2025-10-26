/**
 * Metric Generator Agent
 *
 * This agent takes a specific topic/feature and generates 1-3 product metrics for it.
 * It analyzes the related files and suggests actionable metrics with SQL queries.
 */

import * as z from "zod";
import { createAgent, tool } from "langchain";
import { ChatAnthropic } from "@langchain/anthropic";
import type { Env, Topic } from "../types";
import { MetricsOutputSchema } from "../types";
import { E2BSandboxClient } from "../services/e2b-sandbox-client";

// ============================================================================
// Context Schema
// ============================================================================

const contextSchema = z.object({
  projectId: z.string().describe("ID of the project/sandbox"),
  topic: z.object({
    name: z.string(),
    description: z.string(),
    relatedFiles: z.array(z.string()),
  }).describe("The topic to generate metrics for"),
});

// ============================================================================
// Create Metric Generator Agent
// ============================================================================

/**
 * Creates a metric generator agent for a specific topic
 */
export function createMetricGeneratorAgent(env: Env, sandboxClient: E2BSandboxClient) {
  // Define exec_command tool
  const execCommand = tool(
    async ({ command }, config) => {
      const projectId = config.context.projectId;

      console.log(`[metric-generator] [exec_command] Executing: ${command} in project ${projectId}`);

      const result = await sandboxClient.execCommand(projectId, command);

      if (!result.success) {
        return `Error: ${result.error}`;
      }

      // Return combined output
      let output = '';
      if (result.stdout) {
        output += `STDOUT:\n${result.stdout}\n`;
      }
      if (result.stderr) {
        output += `STDERR:\n${result.stderr}\n`;
      }
      output += `Exit Code: ${result.exitCode}`;

      return output;
    },
    {
      name: "exec_command",
      description: "Execute a shell command in the sandbox environment. Use this to explore files and search for patterns related to the topic.",
      schema: z.object({
        command: z.string().describe("The shell command to execute"),
      }),
    }
  );

  // Define read_file tool
  const readFile = tool(
    async ({ path }, config) => {
      const projectId = config.context.projectId;

      console.log(`[metric-generator] [read_file] Reading file: ${path} in project ${projectId}`);

      const result = await sandboxClient.readFile(projectId, path);

      if (!result.success) {
        return `Error reading file: ${result.error}`;
      }

      return result.content || '';
    },
    {
      name: "read_file",
      description: "Read the contents of a file. Use this to analyze the related files for the topic.",
      schema: z.object({
        path: z.string().describe("The path to the file to read"),
      }),
    }
  );

  // Create agent with Anthropic model
  const agent = createAgent({
    model: new ChatAnthropic({
      modelName: "claude-haiku-4-5",
      apiKey: env.ANTHROPIC_API_KEY,
      temperature: 0,
    }),
    tools: [execCommand, readFile],
    responseFormat: MetricsOutputSchema,
    contextSchema,
    systemPrompt: `You are a product metrics expert that generates actionable metrics for specific features.

You will receive a topic/feature with:
- name: The feature name
- description: What it does
- relatedFiles: Key files for this feature

Your goal is to generate 1-3 high-value product metrics for this specific topic.

Available tools:
1. exec_command: Run shell commands to explore related files
2. read_file: Read file contents to understand implementation

Workflow:
1. Review the topic name, description, and related files
2. Read 1-2 of the most relevant files to understand the feature
3. Generate 1-3 actionable product metrics for this feature
4. Each metric should be measurable and provide business value

Each metric MUST include:
- name: Clear metric name (e.g., "Login Success Rate", "Payment Completion Time")
- description: What it measures and why it matters (be specific and actionable)
- featureName: The topic name this belongs to
- metricType: Type of metric (conversion, engagement, frequency, performance, retention, revenue, adoption, satisfaction)
- sqlQuery: A suggested SQL query to calculate this metric using placeholder table names (events, users, etc.)
- relatedFiles: List of files where this metric could be tracked (from the topic's relatedFiles)

SQL Query Examples:
- Conversion: "SELECT COUNT(DISTINCT user_id) / (SELECT COUNT(*) FROM users) * 100 AS conversion_rate FROM events WHERE event_name = 'signup_completed'"
- Engagement: "SELECT DATE(created_at) as date, COUNT(*) as daily_active_users FROM events WHERE event_name = 'dashboard_viewed' GROUP BY DATE(created_at)"
- Frequency: "SELECT user_id, COUNT(*) as payment_count FROM events WHERE event_name = 'payment_completed' GROUP BY user_id"
- Performance: "SELECT AVG(duration_ms) as avg_response_time FROM events WHERE event_name = 'api_request_completed' AND endpoint = '/api/auth/login'"

Guidelines:
- Focus on metrics that provide clear business insights
- Ensure SQL queries are realistic and use common event/user tables
- Metrics should be specific to the feature (use the topic name in event names)
- Prioritize metrics that are easy to instrument and understand
- Generate 1-3 metrics (quality over quantity)

Be concise and actionable. Focus on metrics that help teams understand user behavior and feature performance.`,
  });

  return agent;
}
