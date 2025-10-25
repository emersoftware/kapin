# KAPIN Multi-Worker Structure

KAPIN uses a three-worker architecture deployed to Cloudflare:
- **web-worker**: Next.js frontend + API (BFF)
- **agent-worker**: LangGraph.js agent orchestration
- **sandbox-worker**: Cloudflare Sandbox operations

```
the-agent-hackathon/
├── web-worker/                       # Next.js app (Cloudflare Pages)
│   ├── src/
│   │   ├── app/                      # App router
│   │   │   ├── (onboarding)/         # Onboarding flow pages
│   │   │   └── api/                  # API routes (BFF + agent callbacks)
│   │   ├── lib/                      # Libraries and utilities
│   │   │   ├── db/                   # Drizzle ORM + schema
│   │   │   ├── auth/                 # Auth.js config
│   │   │   └── websocket/            # WebSocket Durable Object
│   │   └── components/               # React components
│   ├── drizzle/                      # Database migrations
│   ├── public/                       # Static assets
│   ├── wrangler.jsonc                # Cloudflare config
│   └── package.json
│
├── agent-worker/                     # LangGraph.js agent (Cloudflare Worker)
│   ├── src/
│   │   ├── index.ts                  # Entry point
│   │   ├── agent/
│   │   │   ├── graph.ts              # LangGraph workflow
│   │   │   ├── state.ts              # Agent state
│   │   │   ├── nodes/                # Workflow nodes
│   │   │   └── tools/                # LangChain tools
│   │   └── services/
│   │       ├── sandbox-client.ts     # Calls sandbox-worker
│   │       └── web-client.ts         # Calls web-worker
│   ├── wrangler.toml
│   └── package.json
│
├── sandbox-worker/                   # Sandbox operations (Cloudflare Worker)
│   ├── src/
│   │   └── index.ts                  # Sandbox API wrapper
│   ├── wrangler.toml
│   └── package.json
│
├── CLAUDE.md                         # Project overview & implementation guide
├── STRUCTURE.md                      # This file
└── README.md
```

## Setup

```bash
# Create web-worker (already exists)
cd web-worker
npm install

# Create agent-worker
cd ../agent-worker
npm init -y
npm install @langchain/langgraph @langchain/core @langchain/anthropic hono zod
npm install -D @cloudflare/workers-types typescript wrangler

# Create sandbox-worker
cd ../sandbox-worker
npm init -y
npm install @cloudflare/sandbox hono
npm install -D @cloudflare/workers-types typescript wrangler
```

## Run

```bash
# Start all workers in separate terminals

# Terminal 1: sandbox-worker (port 8787)
cd sandbox-worker && npm run dev

# Terminal 2: agent-worker (port 8788)
cd agent-worker && npm run dev

# Terminal 3: web-worker (port 3000)
cd web-worker && npm run dev
```

## Deploy

```bash
# Deploy in order (dependencies first)
cd sandbox-worker && npm run deploy
cd ../agent-worker && npm run deploy
cd ../web-worker && npm run deploy
```
