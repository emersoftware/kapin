interface Env {
  WEBSOCKET_SESSION: DurableObjectNamespace;
}

type WebSocketMessage =
  | { type: "progress"; message: string }
  | { type: "metrics_generated"; metrics: unknown[] }
  | { type: "completed" }
  | { type: "error"; error: string };

export class WebSocketSession implements DurableObject {
  private sessions: Map<string, Set<WebSocket>>;
  private state: DurableObjectState;
  private env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
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

      // Accept the WebSocket connection
      server.accept();

      // Add to sessions map
      if (!this.sessions.has(runId)) {
        this.sessions.set(runId, new Set());
      }
      this.sessions.get(runId)!.add(server);

      // Handle close event
      server.addEventListener("close", () => {
        const sessions = this.sessions.get(runId);
        if (sessions) {
          sessions.delete(server);
          if (sessions.size === 0) {
            this.sessions.delete(runId);
          }
        }
      });

      server.addEventListener("error", () => {
        const sessions = this.sessions.get(runId);
        if (sessions) {
          sessions.delete(server);
          if (sessions.size === 0) {
            this.sessions.delete(runId);
          }
        }
      });

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    // Handle broadcast message
    if (request.method === "POST" && url.pathname === "/broadcast") {
      try {
        const { runId: targetRunId, message } = await request.json();

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

  private broadcast(runId: string, message: WebSocketMessage) {
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
