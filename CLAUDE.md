# KAPIN - Key Agent Product Metrics INstrumentation

## Overview

KAPIN is an AI agent that automatically instruments software products by analyzing their code graph and transforming it into a business metrics map. The agent analyzes routes, modules, and components of a repository to identify relevant features (onboarding, payments, dashboards, etc.) and automatically generates a complete instrumentation plan.

## What KAPIN Does

KAPIN converts technical architecture into a living product analytics layer by:

1. **Analyzing the code graph** of a repository
2. **Identifying features** from the codebase structure (routes, components, modules)
3. **Generating potential product metrics** based on discovered features
4. **Creating executable instrumentation** including:
   - Database migrations (if needed)
   - SQL queries to calculate product metrics
   - Code snippets to capture and store events
   - Complete instrumentation code

### Example Flow

```
Repository → Features → Potential Product Metrics → Executables
                                                     ├─ DB Migrations
                                                     ├─ SQL Queries
                                                     └─ Instrumentation Code
```

### Example Use Cases

- **Onboarding Feature**: Track conversion rates, step completion times, drop-off points
- **Payment Feature**: Monitor transaction frequency per company, success rates, revenue metrics
- **Dashboard Feature**: Measure usage frequency, peak hours, user engagement patterns

## Tech Stack

### Frontend & Fullstack (web-worker)

- **Framework**: Next.js 15 with @opennextjs/cloudflare adapter
- **Styling**: Tailwind CSS + shadcn/ui (component library)
- **ORM**: Drizzle (for schema management, migrations, and database version control)
- **Authentication**: Auth.js with GitHub OAuth
- **Real-time**: Durable Objects + Native WebSockets (for agent progress updates)
- **Deployment**: Cloudflare Pages

### Agent Execution (agent-worker)

- **Runtime**: Cloudflare Workers (TypeScript)
- **Agent Framework**: LangGraph.js + LangChain (TypeScript, not Python!)
- **LLM Provider**: Anthropic Claude (via @langchain/anthropic)
- **Communication**: Service Bindings to sandbox-worker and web-worker

### Sandbox Management (sandbox-worker)

- **Runtime**: Cloudflare Workers with Durable Objects
- **SDK**: @cloudflare/sandbox
- **Container**: Full Linux environment with git, Node.js, Python
- **Operations**: exec, file read/write, repo cloning, directory listing

### Database

- **Provider**: Supabase (PostgreSQL only)
- **Note**: We use Supabase ONLY as a PostgreSQL database
  - No Supabase Auth
  - No Row Level Security (RLS)
- **Management**: All schema and migrations handled via Drizzle ORM

### Deployment Architecture

All three workers deployed to Cloudflare:
- **web-worker**: Next.js on Cloudflare Pages
- **agent-worker**: Cloudflare Worker (orchestrates agent logic)
- **sandbox-worker**: Cloudflare Worker with Durable Objects (sandbox operations)

## Database Schema

### Core Tables

```
users
├─ id
├─ github_id
├─ email
├─ name
├─ avatar_url
├─ onboarding_step (to persist onboarding progress between sessions)
└─ created_at

orgs
├─ id
├─ name (auto-generated, e.g., "org-1")
├─ created_by_user_id → users
└─ created_at

org_members (join table - users can belong to multiple orgs)
├─ org_id → orgs
├─ user_id → users
├─ role (owner, member)
└─ joined_at

integration (GitHub)
├─ id
├─ user_id → users (personal integration per user)
├─ provider (github)
├─ access_token
├─ refresh_token
└─ created_at

repos
├─ id
├─ org_id → orgs (belongs to org, not directly to user)
├─ github_repo_id
├─ name
├─ full_name
├─ clone_url
└─ created_at

projects
├─ id
├─ org_id → orgs (belongs to org, not directly to user)
├─ name
├─ description
└─ created_at

project_repos (join table)
├─ project_id → projects
└─ repo_id → repos

runs
├─ id
├─ project_id → projects
├─ status (pending, running, completed, failed)
├─ started_at
└─ completed_at

product_metrics
├─ id
├─ project_id → projects
├─ run_id → runs
├─ title
├─ description
├─ feature_name
├─ metric_type (conversion, frequency, engagement, etc.)
├─ sql_query
├─ created_at
└─ metadata (JSON)

instrumentations
├─ id
├─ product_metric_id → product_metrics
├─ content (markdown file with instrumentation guide)
├─ status (pending, generating, completed)
└─ created_at

prs (extensible for instrumentation, might not be in MVP)
├─ id
├─ product_metric_id → product_metrics
├─ github_pr_id
├─ url
└─ created_at
```

### Key Relationships

- A **run** belongs to a **project** and generates multiple **product_metrics**
- A **product_metric** can have one **instrumentation** guide (markdown)
- **Projects** can contain multiple **repos** (for monorepo or multi-repo projects)
- **Users** can have multiple **integrations** (currently only GitHub)
- **Repos** and **Projects** belong to **orgs**, not directly to users
- **Users** belong to **orgs** via **org_members** (many-to-many relationship)

### Organization Architecture (Transparent to User in MVP)

When a user signs up:
1. A `user` record is created in the database
2. An `org` is automatically created with an auto-generated name (e.g., "org-1")
3. An `org_members` record is created linking the user to the org with role "owner"
4. All repos and projects created by the user are linked to this org (via `org_id`)

**Important**: In the MVP, users never see or interact with orgs directly. The org structure is transparent and automatic. This architecture prepares the system for future multi-user/team features without requiring migration later.

## MVP Frontend - Onboarding Flow

The MVP consists of a single page with a complete onboarding experience:

### Step 1: Landing (Not Logged In)
- Centered hero section
- KAPIN logo (to be designed)
- "KAPIN" text with well-separated letters
- Tagline: "easy product metrics instrumentation"
- "Get Started" button

### Step 2: Authentication Prompt
- Logo remains at top
- "Sign in with GitHub" button appears
- User clicks and goes through GitHub OAuth flow
- Need to create GitHub OAuth App with proper permissions

### Step 3: Repository Selection
- Show list of repositories the user has access to
- Include search bar to filter repos
- User selects repositories that belong to the same software project
- "Add to Project" or "Continue" button

### Step 4: Sandbox Creation & Agent Execution
- Circular loader appears
- Copy: "WAKE UP KAPIN!"
- Behind the scenes:
  - Next.js creates Cloudflare sandbox
  - Clones selected repos into sandbox
  - Launches KAPIN agent (LangGraph)
- Real-time updates via WebSocket showing agent actions:
  - "Analyzing repository structure..."
  - "Detecting features..."
  - "Generating product metrics..."
  - etc.

### Step 5: Product Metrics Results
- Display product metrics as a list of cards
- Each card shows:
  - Title
  - Short description (truncated)
  - Dropdown to expand and see full details:
    - Complete description
    - Feature name
    - Metric type
    - SQL query preview
    - Metadata
  - "How to Apply" button

### Step 6: Generate Instrumentation Guide
- User clicks "How to Apply" on a product metric
- Triggers another agent in the same sandbox
- Agent generates markdown instrumentation guide
- Shows loading state on button
- When complete, reveals the instrumentation guide

### Step 7: View Instrumentation Guides
- List of generated "How to Apply" guides
- Each guide is a rendered markdown document with:
  - Database migrations needed
  - Code snippets to add
  - Where to add event tracking
  - SQL queries to calculate the metric

## Architecture

### High-Level Architecture - Three Cloudflare Workers

```
┌─────────────────────────────────────────────────────────┐
│  web-worker (Next.js @opennextjs/cloudflare)           │
│  - Frontend UI + API Routes                             │
│  - Auth.js                                              │
│  - Drizzle ORM                                          │
│  - Durable Object: WebSocketSession                     │
│  - Exposes: /api/agent/* for callbacks                  │
└────────────▲────────────────────────────────────────────┘
             │ Service Binding (callbacks)
             │
┌────────────┴─────────────────────────────────────────────┐
│  agent-worker (LangGraph.js + LangChain)                │
│  - LangGraph agent orchestration                         │
│  - Feature detection                                     │
│  - Metric generation                                     │
│  - Instrumentation guide generation                      │
│  - Uses: Service Binding → sandbox-worker                │
│  - Uses: Service Binding → web-worker (callbacks)        │
└────────────┬─────────────────────────────────────────────┘
             │ Service Binding
             ↓
┌──────────────────────────────────────────────────────────┐
│  sandbox-worker (@cloudflare/sandbox)                    │
│  - Durable Object: Sandbox                               │
│  - Clone repos                                           │
│  - Execute commands                                      │
│  - File operations                                       │
└──────────────────────────────────────────────────────────┘
             │
             ↓
    ┌────────────────────┐
    │  PostgreSQL        │
    │  (Supabase)        │
    │  ← web-worker      │
    └────────────────────┘

Usuario → web-worker → agent-worker → sandbox-worker
                ↑           ↓
                └───────────┘
              (callbacks via Service Binding)
```

### Three Workers Explained

#### 1. **web-worker** (Next.js Frontend + BFF)
- Your existing Next.js application
- Handles UI, authentication, database operations
- Exposes callback endpoints for agent-worker
- Manages WebSocket connections via Durable Objects
- **Endpoints:**
  - `/api/agent/progress` - Receive progress updates, emit to WebSocket
  - `/api/agent/metrics` - Save metrics to database
  - `/api/agent/complete` - Mark run as completed
  - `/api/agent/error` - Handle agent errors
  - `/api/runs/[id]/start` - Triggers agent-worker via Service Binding

#### 2. **agent-worker** (Agent Orchestration)
- Runs the LangGraph.js agent workflow
- Communicates with sandbox-worker to execute commands
- Makes callbacks to web-worker to save progress/metrics
- **Flow:**
  1. Setup sandbox (create + clone repos)
  2. Analyze structure (ls, find files, read package.json)
  3. Detect features (LLM analysis)
  4. Generate metrics (LLM generation)
  5. Save to DB (callback to web-worker)
- **Endpoints:**
  - `POST /api/runs/:runId/start` - Start agent analysis

#### 3. **sandbox-worker** (Sandbox Operations)
- Wraps @cloudflare/sandbox SDK
- Provides REST API for sandbox operations
- One persistent sandbox per project
- **Endpoints:**
  - `POST /sandboxes/:projectId` - Get/create sandbox
  - `POST /sandboxes/:projectId/exec` - Execute command
  - `POST /sandboxes/:projectId/clone` - Clone repo
  - `GET /sandboxes/:projectId/files/*` - Read file
  - `PUT /sandboxes/:projectId/files/*` - Write file
  - `GET /sandboxes/:projectId/ls` - List directory
  - `DELETE /sandboxes/:projectId` - Cleanup sandbox

### Authentication Flow

1. User clicks "Sign in with GitHub"
2. Auth.js handles GitHub OAuth flow
3. Store GitHub access token in `integration` table
4. Create/update user in `users` table
5. Session managed by Auth.js
6. Protected routes check session server-side

### Agent Communication Flow (Three Workers)

1. **User triggers run** → Frontend calls `POST /api/runs/[id]/start` on web-worker
2. **web-worker** invokes agent-worker via Service Binding
3. **agent-worker** invokes sandbox-worker via Service Binding to:
   - Create/get sandbox for project
   - Clone repositories (if not already cloned) or pull latest
4. **agent-worker** executes LangGraph workflow:
   - Setup sandbox → callback to web-worker: `POST /api/agent/progress` ("Setting up sandbox...")
   - Clone repos → callback: `POST /api/agent/progress` ("Cloning repositories...")
   - Analyze structure → callback: `POST /api/agent/progress` ("Analyzing code structure...")
   - Detect features → callback: `POST /api/agent/progress` ("Detected feature: Payments")
   - Generate metrics → callback: `POST /api/agent/metrics` (save to DB)
   - Complete → callback: `POST /api/agent/complete` (mark run complete)
5. **web-worker** receives callbacks and emits WebSocket events to frontend via Durable Object
6. **Frontend** updates UI in real-time with agent progress
7. When complete, frontend transitions to Step 3 (metrics display)

### Run Lifecycle

1. User selects repos and starts run
2. Create `run` record with status "pending"
3. Create `project` and link repos
4. Update run status to "running"
5. Launch sandbox and agent
6. Agent discovers features and generates metrics
7. For each metric, create `product_metrics` record
8. Update run status to "completed"
9. Display metrics to user

### Instrumentation Generation

1. User clicks "How to Apply" on a product metric
2. Create `instrumentations` record with status "pending"
3. Trigger agent in same sandbox (or new sandbox)
4. Agent generates markdown guide
5. Update `instrumentations` record with content
6. Mark status as "completed"
7. Display rendered markdown to user

## Development Guidelines

### Database Management

- All schema changes go through Drizzle migrations
- Never use Supabase dashboard for schema changes
- Run `npm run db:generate` to create migrations
- Run `npm run db:migrate` to apply migrations

### Authentication

- Use Auth.js session helpers: `getServerSession()`, `useSession()`
- All protected routes must check authentication server-side
- GitHub OAuth is the only login method
- Store GitHub tokens securely in `integration` table

### Worker Development

#### sandbox-worker
- Use @cloudflare/sandbox SDK's `getSandbox(env.Sandbox, projectId)`
- One sandbox per project (persistent across runs)
- All sandbox operations are async
- Return structured responses: `{ success, stdout, stderr, exitCode }`
- Use Durable Objects for sandbox state management

#### agent-worker
- Use LangGraph.js for agent workflow orchestration
- All agents written in TypeScript
- Use Service Bindings to communicate with sandbox-worker and web-worker
- Keep nodes modular and composable
- Use Anthropic Claude via @langchain/anthropic
- Store ANTHROPIC_API_KEY as Cloudflare secret

#### web-worker
- Next.js with @opennextjs/cloudflare adapter
- Use Service Bindings to receive calls from agent-worker
- WebSocket management via Durable Objects (not socket.io)
- All agent callbacks must emit WebSocket events for real-time updates

### WebSocket Events

Emitted from web-worker callbacks to frontend:
- `agent:started` - Agent workflow has started
- `agent:progress` - Progress update with message (e.g., "Cloning repos...")
- `agent:feature_detected` - Feature detected with feature name
- `agent:metric_generated` - Metric generated with metric ID
- `agent:completed` - Agent completed successfully
- `agent:error` - Error occurred with error message

### Service Bindings Configuration

Each worker must declare bindings in `wrangler.toml`:

**agent-worker** needs:
```toml
[[services]]
binding = "SANDBOX_WORKER"
service = "kapin-sandbox-worker"

[[services]]
binding = "WEB_WORKER"
service = "kapin-web-worker"
```

**web-worker** needs:
```toml
[[services]]
binding = "AGENT_WORKER"
service = "kapin-agent-worker"
```

## Research & References

See `/research/open-swe/` for reference implementations and research on:
- Code graph analysis techniques
- Agent architectures
- Instrumentation patterns

## Target Users

- **Developers**: Want to understand which parts of their code are being used
- **Product Managers**: Need metrics to validate feature impact
- **Indie Hackers**: Want quick insights without manual analytics setup
- **Engineering Teams**: Need to instrument new features consistently

## Key Benefits

1. **Zero Manual Setup**: No need to manually decide what to track
2. **Code-Aware**: Product metrics are tied directly to code features
3. **Complete Package**: Get migrations, queries, and code all at once
4. **Actionable Insights**: SQL queries are ready to run and visualize
5. **Evolves with Code**: Re-run analysis as codebase changes
6. **Guided Instrumentation**: Step-by-step markdown guides for implementation

## Getting Started

1. Clone the Next.js repository
2. Set up Supabase PostgreSQL database
3. Configure environment variables
4. Run database migrations with Drizzle
5. Create GitHub OAuth App
6. Start Next.js dev server
7. Navigate to app and complete onboarding
8. Point KAPIN at your first repository to analyze

## Environment Variables & Secrets

### web-worker (Next.js)
```bash
# .dev.vars (local) or Cloudflare dashboard (production)
DATABASE_URL=postgresql://...
NEXTAUTH_SECRET=...
NEXTAUTH_URL=http://localhost:3000
GITHUB_ID=...
GITHUB_SECRET=...
SUPABASE_URL=...
SUPABASE_KEY=...
```

### agent-worker
```bash
# Set via: wrangler secret put ANTHROPIC_API_KEY
ANTHROPIC_API_KEY=sk-ant-xxx...
```

### sandbox-worker
```bash
# No secrets needed
# Uses Cloudflare Sandbox binding configured in wrangler.toml
```

## Implementation Guide - Three Workers

### Project Structure

```
the-agent-hackathon/
├── web-worker/             # web-worker (Next.js - already exists)
│   ├── src/
│   ├── wrangler.toml
│   └── package.json
├── agent-worker/           # TO BE CREATED
│   ├── src/
│   │   ├── index.ts
│   │   ├── agent/
│   │   │   ├── graph.ts
│   │   │   ├── state.ts
│   │   │   ├── nodes/
│   │   │   │   ├── setup-sandbox.ts
│   │   │   │   ├── analyze-structure.ts
│   │   │   │   ├── detect-features.ts
│   │   │   │   ├── generate-metrics.ts
│   │   │   │   └── save-results.ts
│   │   │   └── tools/
│   │   │       ├── sandbox-exec.ts
│   │   │       ├── sandbox-read-file.ts
│   │   │       └── sandbox-list-files.ts
│   │   └── services/
│   │       ├── sandbox-client.ts
│   │       └── web-client.ts
│   ├── wrangler.toml
│   └── package.json
└── sandbox-worker/         # TO BE CREATED
    ├── src/
    │   └── index.ts
    ├── wrangler.toml
    └── package.json
```

### Development Order

**Phase 1: sandbox-worker** (Start here)
- Simplest worker, no dependencies
- Wraps @cloudflare/sandbox SDK
- Provides REST API for sandbox operations

**Phase 2: agent-worker** (After sandbox-worker)
- Depends on sandbox-worker
- Orchestrates LangGraph workflow
- Makes callbacks to web-worker

**Phase 3: web-worker** (Finally)
- Add callback endpoints for agent
- Configure Service Binding to agent-worker
- Implement Durable Object for WebSocket

### 1. sandbox-worker Setup

#### Dependencies (sandbox-worker/package.json)
```json
{
  "name": "sandbox-worker",
  "version": "1.0.0",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy"
  },
  "dependencies": {
    "@cloudflare/sandbox": "^0.3.3",
    "hono": "^4.6.14"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20241127.0",
    "typescript": "^5.3.3",
    "wrangler": "^3.101.0"
  }
}
```

#### Configuration (sandbox-worker/wrangler.toml)
```toml
name = "kapin-sandbox-worker"
main = "src/index.ts"
compatibility_date = "2025-01-20"

[[durable_objects.bindings]]
name = "Sandbox"
class_name = "Sandbox"
script_name = "kapin-sandbox-worker"

[containers]
image = "docker.io/cloudflare/sandbox:latest"

[vars]
ENVIRONMENT = "production"
```

#### Endpoints
- `POST /sandboxes/:projectId` - Create/get sandbox
- `POST /sandboxes/:projectId/exec` - Execute command
- `POST /sandboxes/:projectId/clone` - Clone repo (via GitHub tarball)
- `GET /sandboxes/:projectId/files/*` - Read file
- `PUT /sandboxes/:projectId/files/*` - Write file
- `GET /sandboxes/:projectId/ls` - List directory
- `DELETE /sandboxes/:projectId` - Cleanup sandbox

### 2. agent-worker Setup

#### Dependencies (agent-worker/package.json)
```json
{
  "name": "agent-worker",
  "version": "1.0.0",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy"
  },
  "dependencies": {
    "@langchain/langgraph": "^0.2.38",
    "@langchain/core": "^0.3.15",
    "@langchain/anthropic": "^0.3.7",
    "hono": "^4.6.14",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20241127.0",
    "typescript": "^5.3.3",
    "wrangler": "^3.101.0"
  }
}
```

#### Configuration (agent-worker/wrangler.toml)
```toml
name = "kapin-agent-worker"
main = "src/index.ts"
compatibility_date = "2025-01-20"
compatibility_flags = ["nodejs_compat"]

[[services]]
binding = "SANDBOX_WORKER"
service = "kapin-sandbox-worker"
environment = "production"

[[services]]
binding = "WEB_WORKER"
service = "kapin-web-worker"
environment = "production"

[vars]
ENVIRONMENT = "production"
```

#### Agent Workflow
```
START
  ↓
setup_sandbox (create sandbox + clone repos)
  ↓
analyze_structure (ls, find files, read package.json)
  ↓
detect_features (use LLM to detect: auth, payments, etc.)
  ↓
generate_metrics (use LLM to generate product metrics)
  ↓
save_to_db (callback to web-worker)
  ↓
END
```

#### Endpoints
- `POST /api/runs/:runId/start` - Start agent analysis

### 3. web-worker Updates

#### New API Routes to Create
- `POST /api/agent/progress` - Receive progress, emit WebSocket
- `POST /api/agent/metrics` - Save metrics to DB
- `POST /api/agent/complete` - Mark run complete
- `POST /api/agent/error` - Handle errors

#### Update Existing Routes
```typescript
// app/api/runs/[id]/start/route.ts
export async function POST(req, { params }, context) {
  const response = await context.env.AGENT_WORKER.fetch(
    new Request(`https://fake/api/runs/${params.id}/start`, {
      method: 'POST',
      body: await req.text(),
    })
  );
  return response;
}
```

#### Add Durable Object for WebSockets
Create `src/lib/websocket/WebSocketSession.ts` for managing real-time connections.

### Development Commands

#### sandbox-worker
```bash
cd sandbox-worker
npm init -y
npm install @cloudflare/sandbox hono
npm install -D @cloudflare/workers-types typescript wrangler

# Development
npm run dev

# Testing
curl -X POST http://localhost:8787/sandboxes/test-project
curl -X POST http://localhost:8787/sandboxes/test-project/exec \
  -H "Content-Type: application/json" \
  -d '{"command":"ls -la"}'

# Deploy
npm run deploy
```

#### agent-worker
```bash
cd agent-worker
npm init -y
npm install @langchain/langgraph @langchain/core @langchain/anthropic hono zod
npm install -D @cloudflare/workers-types typescript wrangler

# Set secret
wrangler secret put ANTHROPIC_API_KEY

# Development (requires sandbox-worker running)
npm run dev

# Testing
curl -X POST http://localhost:8788/api/runs/test-run-1/start \
  -H "Content-Type: application/json" \
  -d '{
    "runId": "test-run-1",
    "projectId": "proj-1",
    "repos": [{
      "name": "test-repo",
      "clone_url": "https://github.com/user/repo.git"
    }]
  }'

# Deploy
npm run deploy
```

#### web-worker
```bash
cd web-worker

# Add Service Binding to wrangler.toml
# Create callback endpoints in app/api/agent/
# Implement Durable Object for WebSocket

# Development
npm run dev

# Deploy
npm run deploy
```

### Testing End-to-End Flow

1. Start all three workers locally:
   - `sandbox-worker` on port 8787
   - `agent-worker` on port 8788
   - `web-worker` on port 3000

2. Sign in to KAPIN frontend

3. Select repos and create project (Step 1)

4. Frontend calls `POST /api/runs/[id]/start`

5. Watch WebSocket events in browser console:
   - "Setting up sandbox..."
   - "Cloning repositories..."
   - "Analyzing code structure..."
   - "Detected feature: Authentication"
   - "Generated metric: Login Success Rate"
   - "Analysis complete!"

6. Verify metrics in database and UI (Step 3)

## MVP Scope

### In Scope
- ✅ GitHub OAuth authentication
- ✅ Repository selection and project creation
- ✅ Cloudflare sandbox creation and management
- ✅ KAPIN agent for feature detection and metric generation
- ✅ Real-time WebSocket updates during agent execution
- ✅ Product metrics display (cards with expandable details)
- ✅ "How to Apply" instrumentation guide generation
- ✅ Onboarding progress persistence between sessions

### Out of Scope (Future)
- ❌ PRs table and automatic PR creation for instrumentation
- ❌ Organizations and multi-user teams
- ❌ Visualization dashboard for metrics
- ❌ Real-time monitoring of instrumented metrics
- ❌ Multi-language support (focus on JS/TS first)
- ❌ Custom metric definitions

## Key Architecture Decisions

### Why Three Workers?

1. **Separation of Concerns**
   - web-worker: UI, Auth, Database (stateful)
   - agent-worker: Agent logic, LLM orchestration (stateless)
   - sandbox-worker: Code execution, file operations (isolated)

2. **Security**
   - Untrusted code executes only in sandbox-worker
   - Database credentials never exposed to sandbox
   - GitHub tokens managed in web-worker only

3. **Scalability**
   - Each worker can scale independently
   - Service Bindings are fast (direct worker-to-worker communication)
   - Persistent sandboxes reduce cold start time

### Why TypeScript (not Python)?

- **Cloudflare Workers** run JavaScript/TypeScript natively
- **LangGraph.js** provides same agent capabilities as Python version
- **No runtime conversion** needed (Python Workers use Pyodide/WASM, adding overhead)
- **Simpler deployment** - all workers use same toolchain (wrangler)
- **Better integration** with Next.js ecosystem

### Why Durable Objects (not socket.io)?

- **socket.io doesn't work** on Cloudflare Pages (requires custom server)
- **Durable Objects** provide native WebSocket support
- **Hibernation API** reduces memory usage during idle connections
- **Cloudflare-native** solution, no external dependencies

### Why GitHub Tarball (not git clone)?

- **Lighter weight** than full git clone
- **No git binary** needed in sandbox
- **Faster** for initial download
- **Sufficient** for code analysis (no git history needed)

### Repository Access Strategy

Repos are cloned/downloaded on first run, then pulled on subsequent runs:
1. Check if repo exists in sandbox: `ls /workspace/{repo-name}`
2. If not exists: Download tarball, extract to `/workspace/{repo-name}`
3. If exists: Pull latest (or re-download tarball)
4. This makes subsequent runs faster while keeping code up-to-date

## Notes

- This project is being built for a hackathon
- Focus on end-to-end flow: auth → repo selection → agent run → metrics → instrumentation guide
- Prioritize UX: make the agent's work visible and exciting
- WebSocket updates are crucial for showing progress and building trust
- Markdown instrumentation guides should be clear, copy-pasteable, and actionable
- **All workers must be deployed to Cloudflare** for Service Bindings to work
- Start with sandbox-worker (simplest), then agent-worker, then web-worker updates
