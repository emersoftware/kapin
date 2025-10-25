# KAPIN Sandbox Worker

A Cloudflare Worker that wraps the `@cloudflare/sandbox` SDK to provide a REST API for secure, isolated code execution environments.

## Overview

The Sandbox Worker provides a simple REST API for managing sandboxes and executing commands in isolated containers. Each sandbox is identified by a `projectId` and maintains persistent state via Cloudflare Durable Objects.

## Architecture

```
┌──────────────────────────────────────────┐
│  web-worker (Next.js)                    │
│  - Invokes sandbox-worker via Service    │
│    Binding                                │
└───────────────┬──────────────────────────┘
                │ Service Binding
                ↓
┌──────────────────────────────────────────┐
│  sandbox-worker (This Worker)            │
│  - REST API wrapper around Sandbox SDK   │
│  - Routes requests to Durable Objects    │
└───────────────┬──────────────────────────┘
                │ Durable Object
                ↓
┌──────────────────────────────────────────┐
│  Sandbox Durable Object                  │
│  (@cloudflare/sandbox)                   │
│  - Isolated Linux container              │
│  - git, Node.js, Python                  │
│  - File operations                       │
│  - Process management                    │
└──────────────────────────────────────────┘
```

## Prerequisites

- Docker running locally (required for local development)
- Node.js 20.x or later
- Cloudflare Workers Paid plan (for production)

## Installation

```bash
cd sandbox-worker
npm install
```

## Configuration

The worker is configured via `wrangler.toml`:

- **Container**: Defines the Docker image (`Dockerfile`)
- **Instance Type**: `lite` (can be upgraded to `standard` or `premium`)
- **Max Instances**: Set to 5 concurrent sandboxes (adjust as needed)
- **Durable Objects**: Binds the `Sandbox` Durable Object class

## REST API Endpoints

### Get or Create Sandbox

```
POST /sandboxes/:projectId
```

Creates a sandbox if it doesn't exist, or returns existing sandbox status.

**Response:**
```json
{
  "success": true,
  "data": {
    "projectId": "my-project",
    "status": "ready",
    "message": "Sandbox ready"
  }
}
```

### Execute Command

```
POST /sandboxes/:projectId/exec
```

Execute a shell command in the sandbox.

**Request Body:**
```json
{
  "command": "python --version",
  "stream": false
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "stdout": "Python 3.11.2",
    "stderr": "",
    "exitCode": 0
  }
}
```

### Clone Repository

```
POST /sandboxes/:projectId/clone
```

Clone a git repository into the sandbox.

**Request Body:**
```json
{
  "repoUrl": "https://github.com/user/repo.git",
  "directory": "/workspace/repo"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "repoUrl": "https://github.com/user/repo.git",
    "directory": "/workspace/repo",
    "message": "Repository cloned successfully"
  }
}
```

### Read File

```
GET /sandboxes/:projectId/files/<path>
```

Read a file from the sandbox filesystem.

**Example:**
```
GET /sandboxes/my-project/files/workspace/package.json
```

**Response:**
```json
{
  "success": true,
  "data": {
    "path": "/workspace/package.json",
    "content": "{ \"name\": \"my-app\" }"
  }
}
```

### Write File

```
PUT /sandboxes/:projectId/files/<path>
```

Write a file to the sandbox filesystem.

**Request Body:**
```json
{
  "content": "console.log('Hello, World!');"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "path": "/workspace/index.js",
    "message": "File written successfully"
  }
}
```

### List Directory

```
GET /sandboxes/:projectId/ls?path=/workspace
```

List contents of a directory.

**Response:**
```json
{
  "success": true,
  "data": {
    "path": "/workspace",
    "listing": "total 12\ndrwxr-xr-x 3 root root 4096 Oct 25 10:00 .\n..."
  }
}
```

### Cleanup Sandbox

```
DELETE /sandboxes/:projectId
```

Kill all running processes in the sandbox.

**Response:**
```json
{
  "success": true,
  "data": {
    "projectId": "my-project",
    "status": "cleaned",
    "message": "All processes terminated"
  }
}
```

## Development

### Local Development

```bash
# Start the dev server (first run builds Docker container, takes 2-3 min)
npm run dev

# Test endpoints
curl http://localhost:8787/sandboxes/test-project -X POST
curl http://localhost:8787/sandboxes/test-project/exec \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"command": "echo Hello"}'
```

### Deployment

```bash
# Deploy to Cloudflare
npm run deploy

# First deployment: wait 2-3 minutes for container provisioning
# Check status
npx wrangler containers list
```

## Container Environment

The Dockerfile provides:

- **OS**: Debian Bookworm Slim
- **Version Control**: git
- **Languages**:
  - Node.js 20.x LTS with npm
  - Python 3.11 with pip
- **Build Tools**: gcc, g++, make
- **Python Packages**: pandas, numpy, matplotlib, requests, gitpython
- **Node Packages**: typescript, ts-node, esbuild

## Usage from web-worker

The web-worker can invoke the sandbox-worker via Service Binding:

```typescript
// In web-worker API route
import type { SandboxWorker } from '@/types/workers';

export async function POST(request: Request, env: Env) {
  const sandboxWorker = env.SANDBOX_WORKER as SandboxWorker;

  // Create sandbox
  const response = await sandboxWorker.fetch(
    new Request('http://sandbox/sandboxes/my-project', {
      method: 'POST'
    })
  );

  const result = await response.json();
  // { success: true, data: { ... } }
}
```

## Persistent Storage

Each sandbox is backed by a Durable Object with SQLite storage, ensuring:

- **Persistence**: Sandbox state persists across requests
- **Isolation**: Each `projectId` gets its own isolated environment
- **Consistency**: Strong consistency guarantees for file operations

## Resource Limits

Based on Cloudflare Containers limits:

- **Instance Type**: `lite` (configurable in `wrangler.toml`)
- **CPU**: Shared (upgradeable)
- **Memory**: Limited by instance type
- **Storage**: Durable Object SQLite storage

## Error Handling

All endpoints return consistent error responses:

```json
{
  "success": false,
  "error": "Error message description"
}
```

HTTP status codes:
- `200` - Success
- `400` - Bad request (missing parameters)
- `404` - Resource not found
- `500` - Internal server error

## Security

- **Isolation**: Each sandbox runs in an isolated Linux container
- **CORS**: Enabled with wildcard origin (configure as needed)
- **No Authentication**: Service binding provides internal authentication

## Troubleshooting

### "Cannot connect to the Docker daemon"

Ensure Docker is running locally:
```bash
docker info
```

### Container build takes too long

First build is slow (2-3 min). Subsequent builds use cache.

### Sandbox not responding

Wait 2-3 minutes after first deployment for container provisioning.

## License

MIT
