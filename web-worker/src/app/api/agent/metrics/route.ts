import { db } from "@/lib/db";
import { productMetrics } from "@/lib/db/schema";
import { NextResponse } from "next/server";

interface CloudflareEnv {
  WEBSOCKET_SESSION: DurableObjectNamespace;
}

export async function POST(
  request: Request,
  _params: never,
  context: { env: CloudflareEnv }
) {
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

    // Broadcast to WebSocket clients (single event with all metrics)
    if (context?.env?.WEBSOCKET_SESSION) {
      const id = context.env.WEBSOCKET_SESSION.idFromName("websocket-session");
      const stub = context.env.WEBSOCKET_SESSION.get(id);

      await stub.fetch(new Request("https://fake/broadcast", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          runId,
          message: {
            type: "metrics_generated",
            metrics: savedMetrics,
          },
        }),
      }));
    } else {
      console.log(`[WS Metrics] runId=${runId}, count=${savedMetrics.length}`);
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
