/**
 * KAPIN Sandbox Worker
 *
 * Wraps @cloudflare/sandbox SDK to provide a REST API for sandbox operations.
 * One persistent sandbox instance per project ID.
 *
 * Endpoints:
 * - POST   /sandboxes/:projectId          - Get or create sandbox
 * - POST   /sandboxes/:projectId/exec     - Execute command
 * - POST   /sandboxes/:projectId/clone    - Clone repository
 * - GET    /sandboxes/:projectId/files/*  - Read file
 * - PUT    /sandboxes/:projectId/files/*  - Write file
 * - GET    /sandboxes/:projectId/ls       - List directory
 * - DELETE /sandboxes/:projectId          - Cleanup sandbox
 */

import { getSandbox, type Sandbox } from '@cloudflare/sandbox';

// Re-export Sandbox Durable Object class
export { Sandbox } from '@cloudflare/sandbox';

/**
 * Environment bindings
 */
type Env = {
  Sandbox: DurableObjectNamespace<Sandbox>;
};

/**
 * Standard API response format
 */
type ApiResponse<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

/**
 * Sanitize git URLs to hide tokens in logs
 */
function sanitizeGitUrl(url: string): string {
  // Replace tokens in git URLs like https://x-access-token:TOKEN@github.com/...
  return url.replace(
    /https:\/\/x-access-token:[^@]+@/g,
    'https://x-access-token:***@'
  ).replace(
    /https:\/\/[^:]+:[^@]+@/g,
    'https://***:***@'
  );
}

/**
 * Router for handling sandbox API endpoints
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      const path = url.pathname;
      const method = request.method;

      // Parse route: /sandboxes/:projectId/...
      const sandboxMatch = path.match(/^\/sandboxes\/([^\/]+)(.*)$/);

      if (!sandboxMatch) {
        return jsonResponse({ success: false, error: 'Invalid route' }, 404);
      }

      const [, projectId, subPath] = sandboxMatch;
      const sandbox = getSandbox(env.Sandbox, projectId);

      // Route to appropriate handler
      if (subPath === '' || subPath === '/') {
        // POST /sandboxes/:projectId - Get or create sandbox
        if (method === 'POST') {
          return handleGetOrCreateSandbox(sandbox, projectId);
        }
        // DELETE /sandboxes/:projectId - Cleanup sandbox
        if (method === 'DELETE') {
          return handleCleanupSandbox(sandbox, projectId);
        }
      }

      if (subPath === '/exec' && method === 'POST') {
        // POST /sandboxes/:projectId/exec - Execute command
        return handleExec(sandbox, request);
      }

      if (subPath === '/clone' && method === 'POST') {
        // POST /sandboxes/:projectId/clone - Clone repository
        return handleClone(sandbox, request);
      }

      if (subPath === '/ls' && method === 'GET') {
        // GET /sandboxes/:projectId/ls - List directory
        return handleListDirectory(sandbox, url);
      }

      if (subPath.startsWith('/files/')) {
        const filePath = subPath.substring('/files'.length); // Gets "/<path>" from "/files/<path>"

        if (method === 'GET') {
          // GET /sandboxes/:projectId/files/* - Read file
          return handleReadFile(sandbox, filePath);
        }

        if (method === 'PUT') {
          // PUT /sandboxes/:projectId/files/* - Write file
          return handleWriteFile(sandbox, filePath, request);
        }
      }

      return jsonResponse({ success: false, error: 'Endpoint not found' }, 404);

    } catch (error) {
      console.error('Worker error:', error);
      return jsonResponse(
        {
          success: false,
          error: error instanceof Error ? error.message : 'Internal server error'
        },
        500
      );
    }
  }
};

/**
 * POST /sandboxes/:projectId
 * Get or create a sandbox instance (idempotent operation)
 */
async function handleGetOrCreateSandbox(
  sandbox: Sandbox,
  projectId: string
): Promise<Response> {
  // Simply getting the sandbox creates it if it doesn't exist
  // We can verify it's ready by executing a simple command
  const result = await sandbox.exec('echo "Sandbox ready"');

  return jsonResponse({
    success: true,
    data: {
      projectId,
      status: 'ready',
      message: result.stdout.trim()
    }
  });
}

/**
 * DELETE /sandboxes/:projectId
 * Cleanup/destroy a sandbox instance
 */
async function handleCleanupSandbox(
  sandbox: Sandbox,
  projectId: string
): Promise<Response> {
  // Kill all running processes
  await sandbox.killAllProcesses();

  // Note: Durable Objects can't truly be "deleted", they persist
  // This cleanup kills processes and could clear workspace if needed
  // For a full reset, the agent-worker should use a new projectId

  return jsonResponse({
    success: true,
    data: {
      projectId,
      status: 'cleaned',
      message: 'All processes terminated'
    }
  });
}

/**
 * POST /sandboxes/:projectId/exec
 * Execute a shell command in the sandbox
 *
 * Request body: { command: string, stream?: boolean }
 */
async function handleExec(
  sandbox: Sandbox,
  request: Request
): Promise<Response> {
  const body = await request.json() as { command: string; stream?: boolean };

  if (!body.command) {
    return jsonResponse({ success: false, error: 'Missing command' }, 400);
  }

  const result = await sandbox.exec(body.command);

  return jsonResponse({
    success: result.success,
    data: {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode
    }
  });
}

/**
 * POST /sandboxes/:projectId/clone
 * Clone a git repository into the sandbox
 *
 * Request body: { repoUrl: string, directory?: string, githubToken?: string }
 */
async function handleClone(
  sandbox: Sandbox,
  request: Request
): Promise<Response> {
  const body = await request.json() as {
    repoUrl: string;
    directory?: string;
    githubToken?: string;
  };

  if (!body.repoUrl) {
    return jsonResponse({ success: false, error: 'Missing repoUrl' }, 400);
  }

  // Extract repo name from URL for directory name
  const repoName = body.repoUrl.split('/').pop()?.replace('.git', '') || 'repo';
  const targetDir = body.directory || `/workspace/${repoName}`;

  // Build authenticated clone URL if token is provided
  let cloneUrl = body.repoUrl;
  if (body.githubToken) {
    // Transform https://github.com/owner/repo.git
    // to https://x-access-token:TOKEN@github.com/owner/repo.git
    cloneUrl = body.repoUrl.replace(
      'https://github.com/',
      `https://x-access-token:${body.githubToken}@github.com/`
    );
  }

  // Check if directory exists
  const checkDirResult = await sandbox.exec(`test -d ${targetDir} && echo "exists" || echo "not_exists"`);
  const dirExists = checkDirResult.stdout.trim() === "exists";

  let result;

  if (dirExists) {
    // Directory exists: git pull
    console.log(`[Sandbox] Repository ${repoName} exists, pulling latest changes`);
    result = await sandbox.exec(`cd ${targetDir} && git pull`);

    if (!result.success) {
      console.error(`[Sandbox] Failed to pull ${repoName}: ${result.stderr}`);
      return jsonResponse({
        success: false,
        error: `Failed to pull repository: ${result.stderr}`
      }, 500);
    }

    console.log(`[Sandbox] ✓ Successfully pulled ${repoName}`);
    return jsonResponse({
      success: true,
      data: {
        repoUrl: body.repoUrl,
        directory: targetDir,
        message: 'Repository updated successfully',
        action: 'pull'
      }
    });

  } else {
    // Directory doesn't exist: git clone
    const sanitizedUrl = sanitizeGitUrl(cloneUrl);
    console.log(`[Sandbox] Cloning repository: git clone ${sanitizedUrl} ${targetDir}`);
    const cloneCmd = `git clone ${cloneUrl} ${targetDir}`;
    result = await sandbox.exec(cloneCmd);

    if (!result.success) {
      console.error(`[Sandbox] Failed to clone ${body.repoUrl}: ${result.stderr}`);
      return jsonResponse({
        success: false,
        error: `Failed to clone repository: ${result.stderr}`
      }, 500);
    }

    console.log(`[Sandbox] ✓ Successfully cloned ${body.repoUrl}`);
    return jsonResponse({
      success: true,
      data: {
        repoUrl: body.repoUrl,
        directory: targetDir,
        message: 'Repository cloned successfully',
        action: 'clone'
      }
    });
  }
}

/**
 * GET /sandboxes/:projectId/files/*
 * Read a file from the sandbox filesystem
 */
async function handleReadFile(
  sandbox: Sandbox,
  filePath: string
): Promise<Response> {
  if (!filePath || filePath === '/') {
    return jsonResponse({ success: false, error: 'Missing file path' }, 400);
  }

  try {
    const file = await sandbox.readFile(filePath);

    return jsonResponse({
      success: true,
      data: {
        path: filePath,
        content: file.content
      }
    });
  } catch (error) {
    return jsonResponse({
      success: false,
      error: `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`
    }, 404);
  }
}

/**
 * PUT /sandboxes/:projectId/files/*
 * Write a file to the sandbox filesystem
 *
 * Request body: { content: string }
 */
async function handleWriteFile(
  sandbox: Sandbox,
  filePath: string,
  request: Request
): Promise<Response> {
  if (!filePath || filePath === '/') {
    return jsonResponse({ success: false, error: 'Missing file path' }, 400);
  }

  const body = await request.json() as { content: string };

  if (body.content === undefined) {
    return jsonResponse({ success: false, error: 'Missing content' }, 400);
  }

  try {
    // Ensure parent directory exists
    const dirPath = filePath.substring(0, filePath.lastIndexOf('/'));
    if (dirPath) {
      await sandbox.mkdir(dirPath, { recursive: true });
    }

    await sandbox.writeFile(filePath, body.content);

    return jsonResponse({
      success: true,
      data: {
        path: filePath,
        message: 'File written successfully'
      }
    });
  } catch (error) {
    return jsonResponse({
      success: false,
      error: `Failed to write file: ${error instanceof Error ? error.message : 'Unknown error'}`
    }, 500);
  }
}

/**
 * GET /sandboxes/:projectId/ls
 * List directory contents
 *
 * Query params: ?path=/workspace
 */
async function handleListDirectory(
  sandbox: Sandbox,
  url: URL
): Promise<Response> {
  const dirPath = url.searchParams.get('path') || '/workspace';

  const result = await sandbox.exec(`ls -la ${dirPath}`);

  if (!result.success) {
    return jsonResponse({
      success: false,
      error: `Failed to list directory: ${result.stderr}`
    }, 500);
  }

  return jsonResponse({
    success: true,
    data: {
      path: dirPath,
      listing: result.stdout
    }
  });
}

/**
 * Helper to create JSON responses
 */
function jsonResponse<T>(data: ApiResponse<T>, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
