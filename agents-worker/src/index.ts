/**
 * KAPIN Agent Worker - Entry Point
 *
 * This Cloudflare Worker orchestrates the multi-agent workflow:
 * 1. Feature Detection Agent - Detects features in code (max 5)
 * 2. Metric Generator Agents - Generate metrics per feature (parallel)
 * 3. Metric Reviewer Agent - Reviews metric quality
 * 4. Save results to web-worker database
 */

import { Hono } from "hono";
import type { Env} from "./types";

const app = new Hono<{ Bindings: Env }>();

// Export Durable Object
export { AgentSession } from "./durable-objects/AgentSession";

// Helper: Send message to WebSocket clients via Durable Object
async function broadcastToClients(env: Env, runId: string, message: any) {
  try {
    console.log(`[BROADCAST] Sending to runId ${runId}:`, message.type);
    const id = env.AGENT_SESSION.idFromName(runId);
    const stub = env.AGENT_SESSION.get(id);

    const response = await stub.fetch(new Request("http://fake/broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId, message }),
    }));

    if (!response.ok) {
      console.error(`[BROADCAST] Failed with status ${response.status}`);
    } else {
      console.log(`[BROADCAST] Successfully sent ${message.type}`);
    }
  } catch (error) {
    console.error("[BROADCAST] Failed to send message:", error);
  }
}

// Health check endpoint
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    service: "agents-worker",
    version: "1.0.0",
  });
});

// Broadcast endpoint: Receives messages from web-worker to broadcast via WebSocket
app.post("/api/broadcast", async (c) => {
  try {
    const body = await c.req.json() as {
      runId: string;
      message: any;
    };

    if (!body.runId || !body.message) {
      return c.json({ error: "runId and message are required" }, 400);
    }

    console.log(`[BROADCAST-ENDPOINT] Received broadcast request for runId: ${body.runId}, type: ${body.message.type}`);

    // Forward to Durable Object for WebSocket broadcast
    await broadcastToClients(c.env, body.runId, body.message);

    return c.json({ success: true });
  } catch (error) {
    console.error("[BROADCAST-ENDPOINT] Error:", error);
    return c.json({ error: "Failed to broadcast message" }, 500);
  }
});

// WebSocket endpoint: Browser connects here for real-time updates
app.get("/ws/:runId", async (c) => {
  const { runId } = c.req.param();

  // Get Durable Object stub for this run
  const id = c.env.AGENT_SESSION.idFromName(runId);
  const stub = c.env.AGENT_SESSION.get(id);

  // Forward the WebSocket upgrade request to the Durable Object
  // The Durable Object will extract runId from the URL path
  return stub.fetch(c.req.raw);
});

// Simple agent endpoint: Analyze codebase and detect metrics
app.post("/api/agent/simple/:projectId", async (c) => {
  try {
    const { projectId } = c.req.param();
    const body = await c.req.json() as {
      messages: Array<{ role: string; content: string }>;
      githubToken?: string;
    };

    console.log(`[SIMPLE AGENT] Starting analysis for project ${projectId}`);

    // Create sandbox client and ensure sandbox exists
    const { E2BSandboxClient } = await import("./services/e2b-sandbox-client");
    const sandboxClient = new E2BSandboxClient(c.env.E2B_API_KEY, body.githubToken);

    // Create/get sandbox for this project
    const createResult = await sandboxClient.createSandbox(projectId);
    if (!createResult.success) {
      return c.json({
        success: false,
        error: `Failed to create sandbox: ${createResult.message}`,
      }, 500);
    }

    // Import and run multi-agent workflow
    const { runWorkflow } = await import("./graph/workflow");

    const result = await runWorkflow(
      c.env,
      sandboxClient,
      {
        runId: `simple-${projectId}`,
        projectId,
        repos: [],
        githubToken: body.githubToken,
        topics: [],
        topMetrics: [],
        allMetrics: [],
        approvedMetrics: [],
        errors: [],
      }
    );

    console.log(`[SIMPLE AGENT] Analysis completed for project ${projectId}`);
    console.log(`[SIMPLE AGENT] Topics:`, result.topics.length);
    console.log(`[SIMPLE AGENT] Top priority metrics:`, result.topMetrics.length);
    console.log(`[SIMPLE AGENT] Metrics by topic:`, result.allMetrics.length);
    console.log(`[SIMPLE AGENT] Total metrics:`, result.approvedMetrics.length);

    return c.json({
      success: true,
      topics: result.topics,
      topMetrics: result.topMetrics,
      allMetrics: result.allMetrics,
      approvedMetrics: result.approvedMetrics,
    });

  } catch (error) {
    console.error("[SIMPLE AGENT] Error:", error);

    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      500
    );
  }
});

// Main endpoint: Start agent analysis for a run (using simple-agent)
app.post("/api/runs/:runId/start", async (c) => {
  try {
    const { runId } = c.req.param();
    const body = await c.req.json() as {
      projectId: string;
      repos: Array<{ id: string; name: string; clone_url: string }>;
      githubToken?: string;
    };

    console.log(`[AGENT] Starting simple agent for run ${runId}`, {
      projectId: body.projectId,
      repos: body.repos.map((r) => r.name),
    });

    // 1. WebSocket: Analysis started
    await broadcastToClients(c.env, runId, {
      type: "progress",
      message: "Agent analysis started",
    });

    // 2. Setup Sandbox + Clone/Pull Repos
    const { E2BSandboxClient } = await import("./services/e2b-sandbox-client");
    const sandboxClient = new E2BSandboxClient(c.env.E2B_API_KEY, body.githubToken);

    // 2a. WebSocket: Setting up sandbox
    await broadcastToClients(c.env, runId, {
      type: "progress",
      message: "Setting up sandbox...",
    });

    const createResult = await sandboxClient.createSandbox(body.projectId);
    if (!createResult.success) {
      console.error("[AGENT] Failed to create sandbox:", createResult.message);

      // WebSocket: Send error
      await broadcastToClients(c.env, runId, {
        type: "error",
        error: `Failed to create sandbox: ${createResult.message}`,
      });

      // HTTP: Mark run as failed in database
      try {
        await fetch(`${c.env.WEB_WORKER_URL}/api/agent/error`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            runId,
            error: `Failed to create sandbox: ${createResult.message}`,
          }),
        });
      } catch (callbackError) {
        console.error("[AGENT] Failed to send error callback:", callbackError);
      }

      return c.json({
        success: false,
        error: `Failed to create sandbox: ${createResult.message}`,
      }, 500);
    }

    console.log("[AGENT] Sandbox created successfully");

    // 2b. Get current directory
    const cwdResult = await sandboxClient.getCurrentDir(body.projectId);
    if (!cwdResult.success) {
      console.error('[AGENT] Failed to get current directory:', cwdResult.error);
    } else {
      console.log(`[AGENT] Working directory: ${cwdResult.dir}`);
    }

    // 2c. Clone/pull repositories
    let clonedCount = 0;
    for (const repo of body.repos) {
      // WebSocket: Syncing repo
      await broadcastToClients(c.env, runId, {
        type: "progress",
        message: `Syncing ${repo.name}...`,
      });

      const cloneResult = await sandboxClient.cloneRepo(body.projectId, repo);

      if (cloneResult.success) {
        const action = cloneResult.data?.action; // 'clone' or 'pull'
        console.log(`[AGENT] ${action === 'pull' ? 'Pulled' : 'Cloned'} ${repo.name}`);
        clonedCount++;
      } else {
        console.error(`[AGENT] Failed to sync ${repo.name}:`, cloneResult.message);
        // Continue with other repos instead of failing completely
      }
    }

    if (clonedCount === 0) {
      await broadcastToClients(c.env, runId, {
        type: "error",
        message: "Failed to clone any repositories",
      });
      return c.json({
        success: false,
        error: 'Failed to clone any repositories'
      }, 500);
    }

    console.log(`[AGENT] Successfully cloned/pulled ${clonedCount}/${body.repos.length} repos`);

    // 2d. Verify repositories are accessible
    const lsResult = await sandboxClient.execCommand(
      body.projectId,
      'ls -la'
    );

    console.log('[AGENT] Current directory contents:');
    console.log(lsResult.stdout);

    // 3. WebSocket: Starting analysis
    await broadcastToClients(c.env, runId, {
      type: "progress",
      message: "Analyzing codebase...",
    });

    // 4. Run Multi-Agent Workflow
    const { runWorkflow } = await import("./graph/workflow");

    const result = await runWorkflow(
      c.env,
      sandboxClient,
      {
        runId,
        projectId: body.projectId,
        repos: body.repos,
        githubToken: body.githubToken,
        topics: [],
        topMetrics: [],
        allMetrics: [],
        approvedMetrics: [],
        errors: [],
      }
    );

    console.log(`[AGENT] Multi-agent workflow completed for run ${runId}`);
    console.log(`[AGENT] Detected ${result.topics.length} topics`);
    console.log(`[AGENT] Generated ${result.topMetrics.length} top priority metrics`);
    console.log(`[AGENT] Generated ${result.allMetrics.length} metrics by topic`);
    console.log(`[AGENT] Total ${result.approvedMetrics.length} metrics`);
    console.log(`[AGENT] Note: Metrics were saved progressively during workflow execution`);

    // WebSocket: Analysis completed
    await broadcastToClients(c.env, runId, {
      type: "completed",
    });

    // 8b. HTTP: Mark run as completed in database
    try {
      await fetch(`${c.env.WEB_WORKER_URL}/api/agent/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId,
          projectId: body.projectId,
        }),
      });
    } catch (error) {
      console.error("[AGENT] Failed to send complete callback:", error);
    }

    return c.json({
      success: true,
      runId,
      result: {
        topics: result.topics,
        topMetrics: result.topMetrics,
        allMetrics: result.allMetrics,
        approvedMetrics: result.approvedMetrics,
      },
    });

  } catch (error) {
    console.error("[AGENT] Error:", error);

    const { runId } = c.req.param();

    // WebSocket: Send error
    await broadcastToClients(c.env, runId, {
      type: "error",
      error: error instanceof Error ? error.message : "Unknown error",
    });

    // HTTP: Mark run as failed in database
    try {
      await fetch(`${c.env.WEB_WORKER_URL}/api/agent/error`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId,
          error: error instanceof Error ? error.message : "Unknown error",
        }),
      });
    } catch (callbackError) {
      console.error("[AGENT] Failed to send error callback:", callbackError);
    }

    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      500
    );
  }
});

// CORS preflight handler
app.options("*", (c) => {
  return c.json(
    {},
    200,
    {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    }
  );
});

// 404 handler
app.notFound((c) => {
  return c.json(
    {
      error: "Not found",
      path: c.req.path,
    },
    404
  );
});

// Error handler
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json(
    {
      error: "Internal server error",
      message: err.message,
    },
    500
  );
});

export default app;
