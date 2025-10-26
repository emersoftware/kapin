import { Sandbox } from '@e2b/code-interpreter';

/**
 * E2B Sandbox Client
 *
 * Manages E2B sandboxes with automatic reconnection and metadata-based project association.
 *
 * Strategy:
 * 1. Check local cache for sandbox instance
 * 2. Query E2B API for running sandboxes with matching projectId metadata
 * 3. Reconnect to existing sandbox if found
 * 4. Create new sandbox if none exists
 */
export class E2BSandboxClient {
  // Cache en memoria: projectId → Sandbox instance
  private sandboxes: Map<string, Sandbox> = new Map();

  constructor(
    private apiKey: string,
    private githubToken?: string
  ) {}

  /**
   * Get or create sandbox for a project
   *
   * @param projectId - The project ID to associate with the sandbox
   * @returns Success status and message
   */
  async createSandbox(projectId: string): Promise<{
    success: boolean;
    message?: string;
  }> {
    try {
      // 1. Check local cache
      if (this.sandboxes.has(projectId)) {
        console.log(`[E2B] Using cached sandbox for project ${projectId}`);
        return { success: true, message: 'Using cached sandbox' };
      }

      // 2. Create a new sandbox
      // Note: For hackathon simplicity, we always create new instead of reconnecting
      // This avoids E2B API issues with Sandbox.list()
      console.log(`[E2B] Creating new sandbox for project ${projectId}`);

      const sandbox = await Sandbox.create({
        apiKey: this.apiKey,
        metadata: { projectId },
        timeoutMs: 30 * 60 * 1000, // 30 min
      });

      const info = await sandbox.getInfo();
      console.log(`[E2B] Created sandbox: ${info.sandboxId}`);

      this.sandboxes.set(projectId, sandbox);

      return {
        success: true,
        message: `Created new sandbox ${info.sandboxId}`
      };

    } catch (error) {
      console.error('[E2B] Error creating sandbox:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to create sandbox'
      };
    }
  }

  /**
   * Get the current working directory in the sandbox
   *
   * @param projectId - The project ID
   * @returns Current working directory path
   */
  async getCurrentDir(projectId: string): Promise<{
    success: boolean;
    dir?: string;
    error?: string;
  }> {
    const sandbox = this.sandboxes.get(projectId);
    if (!sandbox) {
      return { success: false, error: 'Sandbox not found. Call createSandbox first.' };
    }

    try {
      // Get current directory
      const result = await sandbox.commands.run('pwd');

      if (result.exitCode !== 0) {
        return {
          success: false,
          error: `Failed to get current directory: ${result.stderr}`
        };
      }

      const currentDir = result.stdout.trim();
      console.log(`[E2B] Current directory: ${currentDir}`);
      return { success: true, dir: currentDir };
    } catch (error) {
      console.error('[E2B] Exception in getCurrentDir:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get current directory'
      };
    }
  }

  /**
   * Clone or pull a repository into the sandbox
   *
   * @param projectId - The project ID
   * @param repo - Repository information
   * @returns Success status, message, and action taken (clone or pull)
   */
  async cloneRepo(projectId: string, repo: { name: string; clone_url: string }): Promise<{
    success: boolean;
    message?: string;
    data?: { action: 'clone' | 'pull' }
  }> {
    const sandbox = this.sandboxes.get(projectId);
    if (!sandbox) {
      return { success: false, message: 'Sandbox not found. Call createSandbox first.' };
    }

    try {
      // Check if repo already exists in current directory
      const checkResult = await sandbox.commands.run(
        `test -d ${repo.name} && echo "exists" || echo "not_exists"`
      );
      const exists = checkResult.stdout.trim() === 'exists';

      if (exists) {
        // Pull latest changes
        const pullResult = await sandbox.commands.run(
          `cd ${repo.name} && git pull`
        );

        if (pullResult.exitCode !== 0) {
          return { success: false, message: `Git pull failed: ${pullResult.stderr}` };
        }

        return {
          success: true,
          message: `Pulled latest changes for ${repo.name}`,
          data: { action: 'pull' }
        };
      } else {
        // Clone repo with GitHub token if provided
        const cloneUrl = this.githubToken
          ? repo.clone_url.replace('https://', `https://x-access-token:${this.githubToken}@`)
          : repo.clone_url;

        console.log(`[E2B] Cloning ${repo.name}...`);
        console.log(`[E2B] Clone URL: ${repo.clone_url}`);

        const cloneResult = await sandbox.commands.run(
          `git clone ${cloneUrl}`
        );

        console.log(`[E2B] Clone stdout: ${cloneResult.stdout}`);
        console.log(`[E2B] Clone stderr: ${cloneResult.stderr}`);
        console.log(`[E2B] Clone exit code: ${cloneResult.exitCode}`);

        if (cloneResult.exitCode !== 0) {
          return {
            success: false,
            message: `Git clone failed: ${cloneResult.stderr}`
          };
        }

        // Verify the repo was cloned
        const verifyResult = await sandbox.commands.run(
          `ls -la ${repo.name}`
        );

        if (verifyResult.exitCode !== 0) {
          console.error(`[E2B] Repo directory not found after clone`);
          return {
            success: false,
            message: `Failed to verify ${repo.name} after cloning`
          };
        }

        console.log(`[E2B] Verified ${repo.name} exists`);
        console.log(`[E2B] Contents: ${verifyResult.stdout}`);

        return {
          success: true,
          message: `Cloned ${repo.name}`,
          data: { action: 'clone' }
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Execute a shell command in the sandbox
   *
   * @param projectId - The project ID
   * @param command - The shell command to execute
   * @returns Command execution result with stdout, stderr, and exit code
   */
  async execCommand(projectId: string, command: string): Promise<{
    success: boolean;
    stdout?: string;
    stderr?: string;
    exitCode?: number;
    error?: string;
  }> {
    const sandbox = this.sandboxes.get(projectId);
    if (!sandbox) {
      return { success: false, error: 'Sandbox not found. Call createSandbox first.' };
    }

    try {
      const result = await sandbox.commands.run(command);

      return {
        success: result.exitCode === 0,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Read a file from the sandbox filesystem
   *
   * @param projectId - The project ID
   * @param path - Absolute or relative path to the file
   * @returns File contents
   */
  async readFile(projectId: string, path: string): Promise<{
    success: boolean;
    content?: string;
    error?: string;
  }> {
    const sandbox = this.sandboxes.get(projectId);
    if (!sandbox) {
      return { success: false, error: 'Sandbox not found. Call createSandbox first.' };
    }

    try {
      const content = await sandbox.files.read(path);
      return {
        success: true,
        content
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to read file'
      };
    }
  }

  /**
   * Cleanup and shutdown a sandbox
   *
   * @param projectId - The project ID
   */
  async cleanup(projectId: string) {
    const sandbox = this.sandboxes.get(projectId);
    if (sandbox) {
      try {
        await sandbox.kill();
        this.sandboxes.delete(projectId);
        console.log(`[E2B] Killed sandbox for project ${projectId}`);
      } catch (error) {
        console.error(`[E2B] Error killing sandbox:`, error);
      }
    }
  }
}
