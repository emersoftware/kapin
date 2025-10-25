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

### Frontend & Fullstack

- **Framework**: Next.js
- **Styling**: Tailwind CSS + shadcn/ui (component library)
- **ORM**: Drizzle (for schema management, migrations, and database version control)
- **Authentication**: Auth.js with GitHub OAuth
- **Real-time**: WebSockets (for agent progress updates)

### Agent Execution

- **Sandbox**: Cloudflare Sandbox (launched from Next.js app)
- **Agent Framework**: LangGraph + LangChain (Python scripts running in sandbox)
- **Architecture**:
  - Sandboxes are created per project from Next.js
  - Repos are cloned inside the sandbox
  - Agents execute Python scripts within the sandbox
  - Agents make HTTP requests to Next.js API
  - Next.js emits WebSocket events to frontend for real-time updates

### Database

- **Provider**: Supabase (PostgreSQL only)
- **Note**: We use Supabase ONLY as a PostgreSQL database
  - No Supabase Auth
  - No Row Level Security (RLS)
- **Management**: All schema and migrations handled via Drizzle ORM

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

### High-Level Architecture

```
┌─────────────────────────────────────┐
│         Next.js App                 │
│   ┌─────────────────────────────┐   │
│   │  Frontend (React)           │   │
│   │  - Onboarding UI            │   │
│   │  - WebSocket client         │   │
│   └──────────┬──────────────────┘   │
│              │                       │
│   ┌──────────▼──────────────────┐   │
│   │  API Routes (BFF)           │   │
│   │  - Auth endpoints           │   │
│   │  - Sandbox management       │   │
│   │  - WebSocket server         │   │
│   │  - Agent callbacks          │   │
│   └──────────┬──────────────────┘   │
│              │                       │
│   ┌──────────▼──────────────────┐   │
│   │  Drizzle ORM                │   │
│   └──────────┬──────────────────┘   │
└──────────────┼───────────────────────┘
               │
               ▼
    ┌──────────────────────┐
    │  PostgreSQL          │
    │  (Supabase)          │
    └──────────────────────┘

         ┌──────────────────────────┐
         │  Cloudflare Sandbox      │
         │  ┌────────────────────┐  │
         │  │  Cloned Repos      │  │
         │  └────────────────────┘  │
         │  ┌────────────────────┐  │
         │  │  Python Environment│  │
         │  │  - LangGraph       │  │
         │  │  - LangChain       │  │
         │  │  - KAPIN Agent     │  │
         │  └────────┬───────────┘  │
         └───────────┼──────────────┘
                     │
                     │ HTTP Requests
                     ▼
         ┌───────────────────────┐
         │  Next.js API Routes   │
         │  (Agent callbacks)    │
         └───────────┬───────────┘
                     │
                     │ WebSocket emit
                     ▼
         ┌───────────────────────┐
         │  Frontend             │
         │  (Real-time updates)  │
         └───────────────────────┘
```

### Authentication Flow

1. User clicks "Sign in with GitHub"
2. Auth.js handles GitHub OAuth flow
3. Store GitHub access token in `integration` table
4. Create/update user in `users` table
5. Session managed by Auth.js
6. Protected routes check session server-side

### Agent Communication Flow

1. Frontend triggers sandbox creation via API
2. Next.js API creates Cloudflare sandbox
3. Sandbox clones repos and starts Python agent
4. Agent makes HTTP POST requests to Next.js callbacks:
   - `/api/agent/progress` - Update progress
   - `/api/agent/metrics` - Submit discovered metrics
   - `/api/agent/complete` - Mark run as complete
5. Next.js API routes emit WebSocket events to frontend
6. Frontend updates UI in real-time

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

### Sandbox Management

- Create one sandbox per project/run
- Clone all project repos into sandbox before starting agent
- Pass necessary environment variables to sandbox
- Clean up sandboxes after run completion (or set TTL)

### WebSocket Events

- Emit events for all agent progress updates
- Event types:
  - `agent:started`
  - `agent:progress` (with message)
  - `agent:feature_detected`
  - `agent:metric_generated`
  - `agent:completed`
  - `agent:error`

### Agent Development

- Use LangGraph for complex agent workflows
- Keep agents modular and composable
- All code execution happens in Cloudflare Sandbox
- Agents communicate with Next.js via HTTP callbacks
- Never execute untrusted code outside sandbox

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

## Environment Variables

### Next.js App
```
DATABASE_URL=postgresql://...
NEXTAUTH_SECRET=...
NEXTAUTH_URL=http://localhost:3000
GITHUB_ID=...
GITHUB_SECRET=...
CLOUDFLARE_SANDBOX_API_KEY=...
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
```

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

## Notes

- This project is being built for a hackathon
- Focus on end-to-end flow: auth → repo selection → agent run → metrics → instrumentation guide
- Prioritize UX: make the agent's work visible and exciting
- WebSocket updates are crucial for showing progress and building trust
- Markdown instrumentation guides should be clear, copy-pasteable, and actionable
