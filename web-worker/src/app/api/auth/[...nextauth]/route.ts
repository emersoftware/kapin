import { handlers } from "@/lib/auth/config";

export const { GET, POST } = handlers;
// Note: @opennextjs/cloudflare uses Node.js runtime, not edge runtime
// The adapter handles Cloudflare Workers compatibility automatically
