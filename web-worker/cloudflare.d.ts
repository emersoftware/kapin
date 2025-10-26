/// <reference types="@cloudflare/workers-types" />

// Make Cloudflare Workers types available globally
declare global {
  // Re-export Cloudflare Workers types
  type DurableObjectNamespace = import("@cloudflare/workers-types").DurableObjectNamespace;
  type DurableObject = import("@cloudflare/workers-types").DurableObject;
  type DurableObjectState = import("@cloudflare/workers-types").DurableObjectState;

  // Cloudflare Workers WebSocket extends standard WebSocket with additional methods
  interface WebSocket {
    accept(): void;
    send(message: string | ArrayBuffer | ArrayBufferView): void;
    close(code?: number, reason?: string): void;
  }

  // Extend ResponseInit to include Cloudflare Workers webSocket property
  interface ResponseInit {
    webSocket?: WebSocket;
  }

  // WebSocket types from Cloudflare Workers
  const WebSocketPair: {
    new (): { 0: WebSocket; 1: WebSocket };
  };
}

export {};
