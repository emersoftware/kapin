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
    const { runId, message } = body;

    if (!runId || !message) {
      return NextResponse.json(
        { error: "runId and message are required" },
        { status: 400 }
      );
    }

    // Broadcast message to WebSocket clients
    if (context?.env?.WEBSOCKET_SESSION) {
      // Use Durable Object if available
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
            type: "progress",
            message,
          },
        }),
      }));
    } else {
      // Log for local development (WebSocket won't work without DO)
      console.log(`[WS Progress] runId=${runId}, message=${message}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error handling progress callback:", error);
    return NextResponse.json(
      { error: "Failed to handle progress" },
      { status: 500 }
    );
  }
}
