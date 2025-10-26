# KAPIN Agent Worker

Multi-agent orchestration worker for KAPIN product metrics instrumentation.

## Architecture

This worker implements a sophisticated multi-agent system using LangGraph:

1. **Feature Detection Agent** - Analyzes codebase and detects features (max 5)
2. **Metric Generator Agents** - Generate product metrics per feature (run in parallel)
3. **Metric Reviewer Agent** - Reviews metrics for quality and relevance
4. **Results Saver** - Sends approved metrics to web-worker

## Workflow

```
START
  ↓
setup_sandbox (creates sandbox + clones repos)
  ↓
detect_features (AI agent with structured output)
  ↓
generate_metrics_parallel (N agents in parallel)
  ↓
review_metrics (AI reviewer with structured output)
  ↓
save_results (callbacks to web-worker)
  ↓
END
```

## Key Features

- **Single Tool**: `exec_sandbox_command` - agents explore code using bash commands
- **Structured Output**: All agents return validated Zod schemas
- **Parallel Execution**: Metric generation happens concurrently for all features
- **Quality Gate**: Reviewer agent filters low-quality metrics

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure Anthropic API key:
```bash
wrangler secret put ANTHROPIC_API_KEY
```

3. Run locally:
```bash
npm run dev
```

Agent worker runs on **port 8788**.

## API Endpoints

### POST /api/runs/:runId/start

Start agent analysis for a run.

**Request body:**
```json
{
  "projectId": "proj-123",
  "repos": [
    {
      "id": "1",
      "name": "example-repo",
      "clone_url": "https://github.com/user/repo.git"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "runId": "run-456",
  "result": {
    "features": [...],
    "metrics": [...],
    "errors": []
  }
}
```

### GET /health

Health check endpoint.

## Dependencies

- **@langchain/langgraph**: Multi-agent orchestration
- **@langchain/anthropic**: Claude integration
- **hono**: HTTP router
- **zod**: Schema validation

## Service Bindings

This worker communicates with:
- **SANDBOX_WORKER**: For code execution
- **WEB_WORKER**: For progress callbacks

## Development

```bash
# Local development
npm run dev

# Deploy to Cloudflare
npm run deploy

# View logs
npm run tail

# Generate types
npm run types
```

## Testing

```bash
# Start sandbox-worker first (port 8787)
cd ../sandbox-worker && npm run dev

# Then start agent-worker (port 8788)
npm run dev

# Test with curl
curl -X POST http://localhost:8788/api/runs/test-1/start \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "test-proj",
    "repos": [{
      "id": "1",
      "name": "test-repo",
      "clone_url": "https://github.com/user/repo.git"
    }]
  }'
```

## Project Structure

```
agent-worker/
├── src/
│   ├── index.ts              # Hono entry point
│   ├── types.ts              # TypeScript types + Zod schemas
│   ├── tools/
│   │   └── exec-sandbox.ts   # Single tool for code exploration
│   ├── agents/
│   │   ├── feature-detector.ts   # Feature detection agent
│   │   ├── metric-generator.ts   # Metric generation agent
│   │   └── metric-reviewer.ts    # Metric review agent
│   ├── graph/
│   │   ├── state.ts          # GraphState definition
│   │   ├── nodes.ts          # Workflow nodes
│   │   └── workflow.ts       # Graph construction
│   ├── services/
│   │   ├── sandbox-client.ts # Sandbox worker client
│   │   └── web-client.ts     # Web worker client
│   └── prompts.ts            # System prompts for agents
├── wrangler.toml             # Cloudflare config
├── package.json              # Dependencies
└── tsconfig.json             # TypeScript config
```

## License

MIT
