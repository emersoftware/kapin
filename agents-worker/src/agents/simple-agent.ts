/**
 * Simple Agent with exec_command tool
 *
 * This agent can execute commands in the sandbox and returns
 * structured output with detected metrics.
 */

import * as z from "zod";
import { createAgent, tool } from "langchain";
import { ChatAnthropic } from "@langchain/anthropic";
import type { Env } from "../types";
import { E2BSandboxClient } from "../services/e2b-sandbox-client";

// ============================================================================
// Structured Output Schema
// ============================================================================

/**
 * Schema for a single metric
 */
export const MetricSchema = z.object({
  name: z.string().describe("Name of the metric"),
  description: z.string().describe("Description of what this metric measures"),
  featureName: z.string().describe("Name of the feature this metric belongs to (e.g., 'Authentication', 'Payments', 'Dashboard')"),
  metricType: z.enum([
    "conversion",
    "engagement",
    "frequency",
    "performance",
    "retention",
    "revenue",
    "adoption",
    "satisfaction"
  ]).describe("Type of metric"),
  sqlQuery: z.string().describe("Suggested SQL query to calculate this metric. Use placeholder table names like 'events', 'users', etc."),
  relatedFiles: z.array(z.string()).describe("List of files related to this metric (relative paths)"),
});

/**
 * Schema for the complete metrics output
 */
export const MetricsOutputSchema = z.object({
  metrics: z.array(MetricSchema).describe("List of detected product metrics"),
});

export type Metric = z.infer<typeof MetricSchema>;
export type MetricsOutput = z.infer<typeof MetricsOutputSchema>;

// ============================================================================
// Context Schema
// ============================================================================

const contextSchema = z.object({
  projectId: z.string().describe("ID of the project/sandbox"),
});

// ============================================================================
// Create Simple Agent
// ============================================================================

/**
 * Creates a simple agent with exec_command and read_file tools
 */
export function createSimpleAgent(env: Env, sandboxClient: E2BSandboxClient) {
  // Use the provided sandboxClient instance instead of creating a new one
  // This ensures the agent can access the sandbox that was already created

  // Define exec_command tool
  const execCommand = tool(
    async ({ command }, config) => {
      const projectId = config.context.projectId;

      console.log(`[exec_command] Executing: ${command} in project ${projectId}`);

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
      description: "Execute a shell command in the sandbox environment. Use this to explore the codebase structure, find files, search for patterns, etc.",
      schema: z.object({
        command: z.string().describe("The shell command to execute (e.g., 'ls -la', 'find . -name \"*.ts\"', 'grep -r \"function\" .')"),
      }),
    }
  );

  // Define read_file tool
  const readFile = tool(
    async ({ path }, config) => {
      const projectId = config.context.projectId;

      console.log(`[read_file] Reading file: ${path} in project ${projectId}`);

      const result = await sandboxClient.readFile(projectId, path);

      if (!result.success) {
        return `Error reading file: ${result.error}`;
      }

      return result.content || '';
    },
    {
      name: "read_file",
      description: "Read the contents of a file in the sandbox filesystem. More efficient than using 'cat' command. Use this after finding files you want to analyze.",
      schema: z.object({
        path: z.string().describe("The absolute or relative path to the file to read (e.g., '/workspace/repo-name/package.json', './src/app/page.tsx')"),
      }),
    }
  );

  // Set LangSmith environment variables for tracing
  if (env.LANGSMITH_TRACING === "true" && env.LANGSMITH_API_KEY) {
    console.log("[AGENT] LangSmith tracing enabled for project:", env.LANGSMITH_PROJECT);
    // Set process env vars for LangChain to pick up
    process.env.LANGCHAIN_TRACING_V2 = "true";
    process.env.LANGCHAIN_ENDPOINT = env.LANGSMITH_ENDPOINT || "https://api.smith.langchain.com";
    process.env.LANGCHAIN_API_KEY = env.LANGSMITH_API_KEY;
    process.env.LANGCHAIN_PROJECT = env.LANGSMITH_PROJECT || "default";
  }

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
    systemPrompt: `You are a code analysis agent that detects product metrics in software projects.

Your goal is to analyze a codebase and identify meaningful product metrics that can help teams understand user behavior and product usage.

Available tools:
1. exec_command: Run shell commands to explore codebase structure (ls, find, grep, etc.)
2. read_file: Read file contents directly (more efficient than cat)

Workflow:
1. Start by exploring the /workspace directory structure
2. Find interesting files (routes, components, API endpoints, configs)
3. Use read_file to analyze relevant files
4. Look for features like authentication, payments, dashboards, forms, etc.
5. For each feature found, suggest 1-3 relevant product metrics

Each metric MUST include:
- name: Clear metric name (e.g., "Login Success Rate", "Payment Completion Time")
- description: What it measures and why it matters
- featureName: The feature this belongs to (e.g., "Authentication", "Payments", "Dashboard")
- metricType: Type of metric (conversion, engagement, frequency, performance, retention, revenue, adoption, satisfaction)
- sqlQuery: A suggested SQL query to calculate this metric using placeholder table names (events, users, etc.)
- relatedFiles: List of files where this metric could be tracked (relative paths from /workspace)

SQL Query Examples:
- Conversion: "SELECT COUNT(DISTINCT user_id) / (SELECT COUNT(*) FROM users) * 100 AS conversion_rate FROM events WHERE event_name = 'signup_completed'"
- Engagement: "SELECT DATE(created_at) as date, COUNT(*) as daily_active_users FROM events WHERE event_name = 'dashboard_viewed' GROUP BY DATE(created_at)"
- Frequency: "SELECT user_id, COUNT(*) as payment_count FROM events WHERE event_name = 'payment_completed' GROUP BY user_id"

Be thorough but concise. Focus on actionable metrics that provide business value.`,
  });

  return agent;
}
