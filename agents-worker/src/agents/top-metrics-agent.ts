/**
 * Top Metrics Agent
 *
 * This agent analyzes the entire codebase and generates the 3 most important
 * product metrics that provide the highest business value.
 */

import * as z from "zod";
import { createAgent, tool } from "langchain";
import { ChatGroq } from "@langchain/groq";
import type { Env } from "../types";
import { MetricsOutputSchema } from "../types";
import { E2BSandboxClient } from "../services/e2b-sandbox-client";

// ============================================================================
// Context Schema
// ============================================================================

const contextSchema = z.object({
  projectId: z.string().describe("ID of the project/sandbox"),
});

// ============================================================================
// Create Top Metrics Agent
// ============================================================================

/**
 * Creates a top metrics agent that generates 3 priority metrics
 */
export function createTopMetricsAgent(env: Env, sandboxClient: E2BSandboxClient) {
  // Define exec_command tool
  const execCommand = tool(
    async ({ command }, config) => {
      const projectId = config.context.projectId;

      console.log(`[top-metrics] [exec_command] Executing: ${command} in project ${projectId}`);

      const result = await sandboxClient.execCommand(projectId, command);

      if (!result.success) {
        return `Error executing command: ${result.error}`;
      }

      // Limit output length
      const output = result.stdout || result.stderr || "";
      const truncated = output.length > 2000 ? output.slice(0, 2000) + "\n... (truncated)" : output;

      return truncated || "Command executed successfully with no output";
    },
    {
      name: "exec_command",
      description: "Execute a shell command in the sandbox to explore the codebase. Use commands like 'ls', 'find', 'grep', 'cat', etc.",
      schema: z.object({
        command: z.string().describe("The shell command to execute (e.g., 'ls -la', 'find . -name \"*.tsx\"', 'grep -r \"useState\"')"),
      }),
    }
  );

  // Define read_file tool
  const readFile = tool(
    async ({ path }, config) => {
      const projectId = config.context.projectId;

      console.log(`[top-metrics] [read_file] Reading: ${path} in project ${projectId}`);

      const result = await sandboxClient.readFile(projectId, path);

      if (!result.success) {
        return `Error reading file: ${result.error}`;
      }

      // Limit file content length
      const content = result.content || "";
      const truncated = content.length > 3000 ? content.slice(0, 3000) + "\n... (truncated)" : content;

      return truncated || "(empty file)";
    },
    {
      name: "read_file",
      description: "Read the contents of a file. Use this to analyze important files in the codebase.",
      schema: z.object({
        path: z.string().describe("The path to the file to read"),
      }),
    }
  );

  // Create agent with Groq model
  const agent = createAgent({
    model: new ChatGroq({
      model: "openai/gpt-oss-120b",
      apiKey: env.GROQ_API_KEY,
      temperature: 0,
    }),
    tools: [execCommand, readFile],
    contextSchema,
    responseFormat: MetricsOutputSchema,
    systemPrompt: `You are a product metrics strategist that quickly identifies the 3 most important metrics for understanding a software product’s performance.

Your goal is to analyze the codebase just enough to infer which metrics provide the **highest business value**, **most actionable insights**, and are **feasible to implement**.

---

### Objective
Generate **exactly 3 top-level product metrics** that best represent how the product delivers value to users and how success can be measured.

---

### Available tools
1. exec_command — Use lightweight commands (ls, find, grep) to explore structure.  
2. read_file — Read only high-signal files (README, package.json, main routes, components).  

---

### Workflow
1. Explore the repo structure minimally (focus on README, routes, main components, APIs).  
2. Identify what the product does and who it serves.  
3. Infer 3 high-impact product metrics that capture user behavior, engagement, or business success.  

Each metric must include:
- **name**: Concise and descriptive (e.g., "User Activation Rate", "Feature Usage Frequency")
- **description**: What it measures and why it matters (1–2 sentences)
- **featureName**: High-level feature category (e.g., "User Onboarding", "Core Features", "Payments")
- **metricType**: conversion, engagement, retention, performance, revenue, adoption, frequency, or satisfaction
- **sqlQuery**: A SQL query showing how to calculate this metric (use placeholder tables like 'events', 'users')
- **relatedFiles**: Array of key file paths where this metric could be tracked  

---

### Output format

{
  "metrics": [
    {
      "name": "User Activation Rate",
      "description": "Measures the percentage of new users who complete key onboarding actions, indicating how effectively the product converts signups into active users.",
      "featureName": "User Onboarding",
      "metricType": "conversion",
      "sqlQuery": "SELECT COUNT(DISTINCT user_id) FILTER (WHERE event_name = 'onboarding_completed') * 100.0 / COUNT(DISTINCT user_id) AS activation_rate FROM events;",
      "relatedFiles": ["src/app/onboarding/page.tsx", "src/components/OnboardingFlow.tsx"]
    },
    {
      "name": "Feature Engagement Rate",
      "description": "Tracks how frequently active users interact with core product features, showing product stickiness and usability.",
      "featureName": "Core Features",
      "metricType": "engagement",
      "sqlQuery": "SELECT COUNT(DISTINCT user_id) AS active_users, COUNT(*) AS feature_uses FROM events WHERE event_name LIKE '%feature_%';",
      "relatedFiles": ["src/app/dashboard/page.tsx", "src/components/FeatureCard.tsx"]
    },
    {
      "name": "Revenue Conversion Rate",
      "description": "Evaluates how many users complete a payment or subscription after initial engagement, directly tying usage to business value.",
      "featureName": "Payments",
      "metricType": "revenue",
      "sqlQuery": "SELECT COUNT(DISTINCT user_id) FILTER (WHERE event_name = 'payment_completed') * 100.0 / COUNT(DISTINCT user_id) FILTER (WHERE event_name = 'signup_completed') AS revenue_conversion FROM events;",
      "relatedFiles": ["src/app/checkout/page.tsx", "src/components/PaymentForm.tsx"]
    }
  ]
}

---

### Guidelines
- Be **fast and general** — avoid deep file exploration.  
- Focus on **user and business outcomes**, not implementation details.  
- Always return **exactly 3 metrics** — the ones that best represent overall product success.  
- Use broad but realistic event names and SQL placeholders.  

---

### Principle
Think like a product lead defining KPIs for an executive dashboard —  
simple, actionable, and high-value insights that summarize how the product performs.
`
  });

  return agent;
}
