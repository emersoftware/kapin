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
    const { runId, error: errorMessage } = body;

    if (!runId || !errorMessage) {
      return NextResponse.json(
        { error: "runId and error are required" },
        { status: 400 }
      );
    }

    // Update run status to "failed"
    await db
      .update(runs)
      .set({ status: "failed", completedAt: new Date() })
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
            type: "error",
            error: errorMessage,
          },
        }),
      }));
    } else {
      console.log(`[WS Error] runId=${runId}, error=${errorMessage}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error handling error callback:", error);
    return NextResponse.json(
      { error: "Failed to handle error" },
      { status: 500 }
    );
  }
}
