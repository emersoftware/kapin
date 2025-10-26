import * as z from "zod";
import { tool } from "@langchain/core/tools";

/**
 * THE ONLY TOOL: Execute bash commands in the sandbox
 *
 * This is the single tool that agents use to explore code.
 * Agents can run any bash command like: ls, cat, grep, find, etc.
 */
export const execSandboxCommand = tool(
  async ({ command }, config) => {
    try {
      // Extract sandbox binding and projectId from config
      const { projectId, sandboxWorker } = config?.configurable as {
        projectId: string;
        sandboxWorker: any;
      };

      if (!sandboxWorker || !projectId) {
        return "Error: Missing sandbox configuration";
      }

      // Call sandbox-worker to execute the command
      const response = await sandboxWorker.fetch(
        new Request(`http://fake/sandboxes/${projectId}/exec`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command }),
        })
      );

      const result = await response.json() as any;

      if (!result.success) {
        return `Error executing command: ${result.error || 'Unknown error'}`;
      }

      const { stdout, stderr, exitCode } = result.data;

      // Format the output for the LLM
      let output = '';

      if (stdout && stdout.trim()) {
        output += `stdout:\n${stdout.trim()}\n`;
      }

      if (stderr && stderr.trim()) {
        output += `stderr:\n${stderr.trim()}\n`;
      }

      output += `exit_code: ${exitCode}`;

      return output;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return `Error: ${errorMsg}`;
    }
  },
  {
    name: "exec_sandbox_command",
    description: `Execute a bash command in the sandbox to explore the codebase.

Available commands:
- ls -la <path> - List files in directory
- cat <file> - Read file contents
- grep -r <pattern> <path> - Search for pattern in files
- find <path> -name <pattern> - Find files by name
- head -n <num> <file> - Read first N lines
- tail -n <num> <file> - Read last N lines
- wc -l <file> - Count lines in file
- tree <path> (if available) - Show directory tree

Examples:
- "ls -la /workspace" - List all files
- "cat /workspace/package.json" - Read package.json
- "grep -r 'function login' /workspace/src" - Find login functions
- "find /workspace -name '*.ts' | head -20" - Find TypeScript files`,
    schema: z.object({
      command: z.string().describe("The bash command to execute in the sandbox"),
    }),
  }
);
