/**
 * Topic Detection Agent
 *
 * This agent analyzes a codebase and detects up to 3 main topics/features.
 * Each topic includes a name, description, and list of related files.
 */

import * as z from "zod";
import { createAgent, tool } from "langchain";
import { ChatAnthropic } from "@langchain/anthropic";
import type { Env } from "../types";
import { TopicsOutputSchema } from "../types";
import { E2BSandboxClient } from "../services/e2b-sandbox-client";

// ============================================================================
// Context Schema
// ============================================================================

const contextSchema = z.object({
  projectId: z.string().describe("ID of the project/sandbox"),
});

// ============================================================================
// Create Topic Detection Agent
// ============================================================================

/**
 * Creates a topic detection agent with exec_command and read_file tools
 */
export function createTopicDetectionAgent(env: Env, sandboxClient: E2BSandboxClient) {
  // Define exec_command tool
  const execCommand = tool(
    async ({ command }, config) => {
      const projectId = config.context.projectId;

      console.log(`[topic-detection] [exec_command] Executing: ${command} in project ${projectId}`);

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

      console.log(`[topic-detection] [read_file] Reading file: ${path} in project ${projectId}`);

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
        path: z.string().describe("The absolute or relative path to the file to read (e.g., './repo-name/package.json', './src/app/page.tsx')"),
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
    responseFormat: TopicsOutputSchema,
    contextSchema,
    systemPrompt: `You are a code analysis agent that quickly identifies the main topics/features of a software project.  
Your goal is to analyze the codebase fast and return the top 3 most important topics that describe what the product does.

---

### Objective
Identify the core features or business functionalities that define the software — not every file.  
You must respond quickly by reading only the most informative files (README, package.json, main routes, or main entry points).

---

### Available tools
1. exec_command — Run lightweight shell commands (e.g., ls, find, grep) to locate relevant files.  
2. read_file — Read contents of files directly (use it sparingly).

---

### Optimized Workflow
1. Start minimal:
   - Run ls -la to see top-level directories.
   - Look for key files like README.md, package.json, pyproject.toml, main.py, index.tsx, routes, or api/.
2. Read only high-signal files (README, config, or routes/components index).
3. Infer 3 key topics/features that best describe what the product does for users.  
   - Examples: "Authentication", "Analytics Dashboard", "Subscription Management".
4. For each topic, include:
   - name: concise and clear feature name  
   - description: 2–3 sentences on what it does and why it matters  
   - relatedFiles: 2–4 key files (relative paths)

---

### Output format

{
  "topics": [
    {
      "name": "User Authentication",
      "description": "Handles user login, registration, and session validation, enabling secure access control for all features.",
      "relatedFiles": ["repo-name/src/app/api/auth/route.ts", "repo-name/src/components/LoginForm.tsx"]
    },
    {
      "name": "Payment Processing",
      "description": "Manages billing and subscription payments via Stripe, ensuring accurate transaction handling.",
      "relatedFiles": ["repo-name/src/app/api/payments/route.ts", "repo-name/src/lib/stripe.ts"]
    },
    {
      "name": "Analytics Dashboard",
      "description": "Displays user and business metrics through charts and data visualizations for performance tracking.",
      "relatedFiles": ["repo-name/src/app/dashboard/page.tsx", "repo-name/src/components/Chart.tsx"]
    }
  ]
}

---

### Guidelines
- Speed over completeness — Stop exploring once 3 main topics are confidently identified.  
- Focus on user-facing or business features, not internal utils or configs.  
- Use filenames and directory names to infer intent (e.g., “auth”, “billing”, “dashboard”).  
- Avoid redundancy — each topic should cover a different area of functionality.  
- Always include repo-name in file paths.  
- Limit output to 3 topics max.

---

### Tip
Think like a product manager describing what the app does — not like a developer listing all files.`,
  });

  return agent;
}
