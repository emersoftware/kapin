import { db } from "@/lib/db";
import { runs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
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
    const { runId } = body;

    if (!runId) {
      return NextResponse.json(
        { error: "runId is required" },
        { status: 400 }
      );
    }

    // Update run status to "completed"
    await db
      .update(runs)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(runs.id, runId));

    // Broadcast to WebSocket clients
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
            type: "completed",
          },
        }),
      }));
    } else {
      console.log(`[WS Complete] runId=${runId}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error handling complete callback:", error);
    return NextResponse.json(
      { error: "Failed to mark run as complete" },
      { status: 500 }
    );
  }
}
