import { NextResponse } from "next/server";

interface CloudflareEnv {
  WEBSOCKET_SESSION: DurableObjectNamespace;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
  context: { env: CloudflareEnv }
) {
  try {
    const { runId } = await params;

    // Get Durable Object stub
    const id = context.env.WEBSOCKET_SESSION.idFromName("websocket-session");
    const stub = context.env.WEBSOCKET_SESSION.get(id);

    // Forward the WebSocket upgrade request to the Durable Object
    const url = new URL(request.url);
    url.searchParams.set("runId", runId);

    const response = await stub.fetch(new Request(url.toString(), {
      headers: request.headers,
    }));

    return response;
  } catch (error) {
    console.error("Error establishing WebSocket connection:", error);
    return NextResponse.json(
      { error: "Failed to establish WebSocket connection" },
      { status: 500 }
    );
  }
}
