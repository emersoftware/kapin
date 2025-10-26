import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// Next.js loads .env.local automatically in development
// In production (Cloudflare Workers), env vars come from wrangler.toml or dashboard
const connectionString = process.env.DATABASE_URL!;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

// Neon serverless driver uses HTTP/fetch under the hood (edge-compatible)
const sql = neon(connectionString);

export const db = drizzle(sql, { schema });
