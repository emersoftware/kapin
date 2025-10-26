import { db } from "@/lib/db";
import { productMetrics } from "@/lib/db/schema";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { runId, projectId, metrics } = body;

    if (!runId || !projectId || !metrics || !Array.isArray(metrics)) {
      return NextResponse.json(
        { error: "runId, projectId, and metrics (array) are required" },
        { status: 400 }
      );
    }

    // Save all metrics to database
    const savedMetrics = await db
      .insert(productMetrics)
      .values(
        metrics.map((metric) => ({
          projectId,
          runId,
          title: metric.title,
          description: metric.description,
          featureName: metric.featureName,
          metricType: metric.metricType,
          sqlQuery: metric.sqlQuery || null,
          metadata: metric.metadata || null,
        }))
      )
      .returning();

    // Broadcast to WebSocket clients via agents-worker
    try {
      const agentsWorkerUrl = process.env.AGENTS_WORKER_URL || "http://localhost:8788";
      console.log(`[WS Metrics] Sending broadcast for runId=${runId}, count=${savedMetrics.length}`);
      console.log(`[WS Metrics] Agents worker URL: ${agentsWorkerUrl}`);

      const broadcastResponse = await fetch(`${agentsWorkerUrl}/api/broadcast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId,
          message: {
            type: "metrics_generated",
            metrics: savedMetrics,
          },
        }),
      });

      if (!broadcastResponse.ok) {
        const errorText = await broadcastResponse.text();
        console.error(`[WS Metrics] Broadcast failed with status ${broadcastResponse.status}: ${errorText}`);
      } else {
        console.log(`[WS Metrics] ✅ Broadcast successful for runId=${runId}`);
      }
    } catch (error) {
      console.error(`[WS Metrics] ❌ Failed to broadcast:`, error);
      // Don't fail the request if broadcast fails
    }

    return NextResponse.json({ success: true, count: savedMetrics.length });
  } catch (error) {
    console.error("Error handling metrics callback:", error);
    return NextResponse.json(
      { error: "Failed to save metrics" },
      { status: 500 }
    );
  }
}
