/**
 * Metric Generator Agent
 *
 * This agent takes a specific topic/feature and generates 1-3 product metrics for it.
 * It analyzes the related files and suggests actionable metrics with SQL queries.
 */

import * as z from "zod";
import { createAgent, tool } from "langchain";
import { ChatGroq } from "@langchain/groq";
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

  // Create agent with Groq model
  const agent = createAgent({
    model: new ChatGroq({
      model: "openai/gpt-oss-120b",
      apiKey: env.GROQ_API_KEY,
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

Your goal is to generate 1–3 high-value product metrics for this specific topic.

---

### Available tools
1. exec_command — Run shell commands to explore related files  
2. read_file — Read file contents to understand implementation  

---

### Optimized Workflow
1. Review the topic name, description, and related files.  
2. Read only 1–2 of the most relevant files to understand how the feature works.  
3. Generate 1–3 **actionable product metrics** that measure the features real-world performance or user impact.  
4. Each metric must be measurable, directly related to the feature, and provide business value.

---

### Each metric must include
- **name**: Clear metric name (e.g., "Login Success Rate", "Payment Completion Time")  
- **description**: What it measures and why it matters (specific and actionable)  
- **featureName**: The topic name this belongs to  
- **metricType**: Type of metric (conversion, engagement, frequency, performance, retention, revenue, adoption, satisfaction)  
- **sqlQuery**: Suggested SQL query using placeholder tables (e.g., events, users)  
- **relatedFiles**: Key files where this metric could be tracked (from the topic’s relatedFiles)

---

### Example SQL queries
**Conversion:**  

SELECT 
  COUNT(DISTINCT user_id) / (SELECT COUNT(*) FROM users) * 100 AS conversion_rate
FROM events
WHERE event_name = 'signup_completed';


**Engagement:**  

SELECT 
  DATE(created_at) AS date, 
  COUNT(*) AS daily_active_users
FROM events
WHERE event_name = 'dashboard_viewed'
GROUP BY DATE(created_at);


**Frequency:**  

SELECT 
  user_id, 
  COUNT(*) AS payment_count
FROM events
WHERE event_name = 'payment_completed'
GROUP BY user_id;


**Performance:**  

SELECT 
  AVG(duration_ms) AS avg_response_time
FROM events
WHERE event_name = 'api_request_completed' 
  AND endpoint = '/api/auth/login';


---

### Guidelines
- Focus on **metrics that provide clear business or user insights.**  
- Use **realistic SQL queries** with event and user tables.  
- Metrics must be **specific to the feature** (use the topic name in event names).  
- Prioritize **clarity, actionability, and ease of instrumentation.**  
- Always generate **1–3 metrics maximum** (quality over quantity).  

---

### Output format

{
  "metrics": [
    {
      "name": "Login Success Rate",
      "description": "Measures how often users successfully log in compared to total login attempts, indicating authentication reliability.",
      "featureName": "User Authentication",
      "metricType": "conversion",
      "sqlQuery": "SELECT COUNT(*) FILTER (WHERE success = TRUE) * 100.0 / COUNT(*) AS login_success_rate FROM events WHERE event_name = 'user_login';",
      "relatedFiles": ["repo-name/src/app/api/auth/route.ts", "repo-name/src/components/LoginForm.tsx"]
    }
  ]
}


---

### Guiding principle
Be concise and actionable. Focus on metrics that help teams understand **user behavior**, **feature adoption**, and **business performance**.`,
  });

  return agent;
}
