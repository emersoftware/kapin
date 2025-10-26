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
import { SandboxClient } from "../services/sandbox-client";

// ============================================================================
// Structured Output Schema
// ============================================================================

/**
 * Schema for a single metric
 */
export const MetricSchema = z.object({
  name: z.string().describe("Name of the metric"),
  description: z.string().describe("Description of what this metric measures"),
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
 * Creates a simple agent with exec_command tool
 */
export function createSimpleAgent(env: Env) {
  const sandboxClient = new SandboxClient(env.SANDBOX_WORKER);

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
      description: "Execute a shell command in the sandbox environment. Use this to explore the codebase, find files, read file contents, search for patterns, etc.",
      schema: z.object({
        command: z.string().describe("The shell command to execute (e.g., 'ls -la', 'find . -name \"*.ts\"', 'cat package.json')"),
      }),
    }
  );

  // Create agent with Anthropic model
  const agent = createAgent({
    model: new ChatAnthropic({
      modelName: "claude-3-5-sonnet-20241022",
      apiKey: env.ANTHROPIC_API_KEY,
      temperature: 0,
    }),
    tools: [execCommand],
    responseFormat: MetricsOutputSchema,
    contextSchema,
    systemPrompt: `You are a code analysis agent that detects product metrics in software projects.

Your goal is to analyze a codebase and identify meaningful product metrics that can help teams understand user behavior and product usage.

Guidelines:
1. Use the exec_command tool to explore the codebase
2. Look for features like authentication, payments, dashboards, forms, etc.
3. For each feature found, suggest 1-3 relevant product metrics
4. Each metric should include:
   - A clear name (e.g., "Login Success Rate", "Payment Completion Time")
   - A description of what it measures and why it matters
   - A list of related files where this metric could be tracked

Be thorough but concise. Focus on actionable metrics that provide business value.`,
  });

  return agent;
}
