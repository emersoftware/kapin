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

// Health check endpoint
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    service: "agents-worker",
    version: "1.0.0",
  });
});

// Simple agent endpoint: Analyze codebase and detect metrics
app.post("/api/agent/simple/:projectId", async (c) => {
  try {
    const { projectId } = c.req.param();
    const body = await c.req.json() as {
      messages: Array<{ role: string; content: string }>;
    };

    console.log(`[SIMPLE AGENT] Starting analysis for project ${projectId}`);

    // Import and create simple agent
    const { createSimpleAgent } = await import("./agents/simple-agent");
    const agent = createSimpleAgent(c.env);

    // Invoke agent with messages and context
    const result = await agent.invoke(
      { messages: body.messages },
      { context: { projectId } }
    );

    console.log(`[SIMPLE AGENT] Analysis completed for project ${projectId}`);
    console.log(`[SIMPLE AGENT] Structured response:`, JSON.stringify(result.structuredResponse, null, 2));

    return c.json({
      success: true,
      structuredResponse: result.structuredResponse,
      messages: result.messages,
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

    // 1. Callback: Analysis started
    try {
      await c.env.WEB_WORKER.fetch(
        new Request("http://fake/api/agent/progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            runId,
            message: "Agent analysis started",
          }),
        })
      );
    } catch (error) {
      console.error("[AGENT] Failed to send progress callback:", error);
    }

    // 2. Setup Sandbox + Clone/Pull Repos
    const { SandboxClient } = await import("./services/sandbox-client");
    const sandboxClient = new SandboxClient(c.env.SANDBOX_WORKER, body.githubToken);

    // 2a. Create/get sandbox
    try {
      await c.env.WEB_WORKER.fetch(
        new Request("http://fake/api/agent/progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            runId,
            message: "Setting up sandbox...",
          }),
        })
      );
    } catch (error) {
      console.error("[AGENT] Failed to send progress callback:", error);
    }

    const createResult = await sandboxClient.createSandbox(body.projectId);
    if (!createResult.success) {
      console.error("[AGENT] Failed to create sandbox:", createResult.message);

      // Callback: error
      try {
        await c.env.WEB_WORKER.fetch(
          new Request("http://fake/api/agent/error", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              runId,
              error: `Failed to create sandbox: ${createResult.message}`,
            }),
          })
        );
      } catch (callbackError) {
        console.error("[AGENT] Failed to send error callback:", callbackError);
      }

      return c.json({
        success: false,
        error: `Failed to create sandbox: ${createResult.message}`,
      }, 500);
    }

    console.log("[AGENT] Sandbox created successfully");

    // 2b. Clone/pull repositories
    for (const repo of body.repos) {
      try {
        await c.env.WEB_WORKER.fetch(
          new Request("http://fake/api/agent/progress", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              runId,
              message: `Syncing ${repo.name}...`,
            }),
          })
        );
      } catch (error) {
        console.error("[AGENT] Failed to send progress callback:", error);
      }

      const cloneResult = await sandboxClient.cloneRepo(body.projectId, repo);

      if (cloneResult.success) {
        const action = cloneResult.data?.action; // 'clone' or 'pull'
        console.log(`[AGENT] ${action === 'pull' ? 'Pulled' : 'Cloned'} ${repo.name}`);
      } else {
        console.error(`[AGENT] Failed to sync ${repo.name}:`, cloneResult.message);
      }
    }

    // 3. Callback: Starting analysis
    try {
      await c.env.WEB_WORKER.fetch(
        new Request("http://fake/api/agent/progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            runId,
            message: "Analyzing codebase...",
          }),
        })
      );
    } catch (error) {
      console.error("[AGENT] Failed to send progress callback:", error);
    }

    // 4. Create Simple Agent
    const { createSimpleAgent } = await import("./agents/simple-agent");
    const agent = createSimpleAgent(c.env);

    // 5. Invoke Simple Agent
    const result = await agent.invoke(
      {
        messages: [{
          role: "user",
          content: `Analyze the codebase in /workspace and detect product metrics.
          Focus on features like authentication, payments, dashboards, forms, etc.
          Return a structured list of metrics with their names, descriptions, and related files.`
        }]
      },
      {
        context: { projectId: body.projectId },
        recursionLimit: 50, // Increased from default 25 to allow more analysis steps
      }
    );

    console.log(`[AGENT] Simple agent completed for run ${runId}`);
    console.log(`[AGENT] Detected ${result.structuredResponse.metrics.length} metrics`);

    // 6. Transform simple-agent metrics to ProductMetric format
    const metrics = result.structuredResponse.metrics.map((metric: any) => ({
      title: metric.name,
      description: metric.description,
      featureName: metric.featureName,
      metricType: metric.metricType,
      sqlQuery: metric.sqlQuery,
      metadata: {
        relatedFiles: metric.relatedFiles
      }
    }));

    // 7. Callback: Save metrics
    if (metrics.length > 0) {
      try {
        await c.env.WEB_WORKER.fetch(
          new Request("http://fake/api/agent/metrics", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              runId,
              projectId: body.projectId,
              metrics,
            }),
          })
        );
      } catch (error) {
        console.error("[AGENT] Failed to send metrics callback:", error);
      }
    }

    // 8. Callback: Mark as completed
    try {
      await c.env.WEB_WORKER.fetch(
        new Request("http://fake/api/agent/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            runId,
            projectId: body.projectId,
          }),
        })
      );
    } catch (error) {
      console.error("[AGENT] Failed to send complete callback:", error);
    }

    return c.json({
      success: true,
      runId,
      result: {
        metrics: result.structuredResponse.metrics,
      },
    });

  } catch (error) {
    console.error("[AGENT] Error:", error);

    // Callback: Mark run as failed
    try {
      await c.env.WEB_WORKER.fetch(
        new Request("http://fake/api/agent/error", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            runId: c.req.param("runId"),
            error: error instanceof Error ? error.message : "Unknown error",
          }),
        })
      );
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
