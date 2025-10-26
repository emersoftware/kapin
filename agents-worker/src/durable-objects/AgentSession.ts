export type AgentMessage =
  | { type: "progress"; message: string }
  | { type: "metrics_generated"; metrics: unknown[] }
  | { type: "completed" }
  | { type: "error"; error: string };

export class AgentSession {
  private sessions: Map<string, Set<WebSocket>>;
  private state: DurableObjectState;
  private env: any;
  protected ctx: DurableObjectState;

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.env = env;
    this.ctx = state;
    this.sessions = new Map();
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const runId = url.searchParams.get("runId");

    if (!runId) {
      return new Response("Missing runId", { status: 400 });
    }

    // Handle WebSocket upgrade
    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      // Use hibernation API for cost savings
      this.ctx.acceptWebSocket(server);

      // Add metadata to track runId
      server.serializeAttachment({ runId });

      // Store connection
      if (!this.sessions.has(runId)) {
        this.sessions.set(runId, new Set());
      }
      this.sessions.get(runId)!.add(server);

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    // Handle broadcast message (called by agent)
    if (request.method === "POST" && url.pathname === "/broadcast") {
      try {
        const { runId: targetRunId, message } = await request.json() as {
          runId: string;
          message: AgentMessage;
        };

        if (!targetRunId || !message) {
          return new Response("Missing runId or message", { status: 400 });
        }

        this.broadcast(targetRunId, message);

        return new Response("OK");
      } catch (error) {
        console.error("Error broadcasting message:", error);
        return new Response("Internal server error", { status: 500 });
      }
    }

    return new Response("Not found", { status: 404 });
  }

  // WebSocket event handlers (hibernation API)
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    // Client messages (if needed in the future)
    console.log("Received message from client:", message);
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    const attachment = ws.deserializeAttachment() as { runId: string } | null;
    if (!attachment) return;

    const { runId } = attachment;
    const sessions = this.sessions.get(runId);
    if (sessions) {
      sessions.delete(ws);
      if (sessions.size === 0) {
        this.sessions.delete(runId);
      }
    }
  }

  async webSocketError(ws: WebSocket, error: unknown) {
    console.error("WebSocket error:", error);
    const attachment = ws.deserializeAttachment() as { runId: string } | null;
    if (!attachment) return;

    const { runId } = attachment;
    const sessions = this.sessions.get(runId);
    if (sessions) {
      sessions.delete(ws);
      if (sessions.size === 0) {
        this.sessions.delete(runId);
      }
    }
  }

  private broadcast(runId: string, message: AgentMessage) {
    const sessions = this.sessions.get(runId);
    if (!sessions) return;

    const messageStr = JSON.stringify(message);

    for (const ws of sessions) {
      try {
        ws.send(messageStr);
      } catch (error) {
        console.error("Error sending message to WebSocket:", error);
        sessions.delete(ws);
      }
    }
  }
}
