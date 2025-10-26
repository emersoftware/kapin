import type { Fetcher } from '@cloudflare/workers-types';
import type { Repository } from '../types';

/**
 * Client for interacting with sandbox-worker
 * Handles sandbox creation and repository cloning
 */
export class SandboxClient {
  constructor(
    private binding: Fetcher,
    private githubToken?: string
  ) {}

  /**
   * Create or get an existing sandbox instance
   */
  async createSandbox(projectId: string): Promise<{ success: boolean; message?: string }> {
    try {
      const response = await this.binding.fetch(
        new Request(`http://fake/sandboxes/${projectId}`, {
          method: 'POST'
        })
      );

      const data = await response.json() as any;
      console.log('[SandboxClient] Create sandbox response:', JSON.stringify(data, null, 2));

      return { success: data.success, message: data.data?.message };
    } catch (error) {
      console.error('Failed to create sandbox:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Clone a repository into the sandbox
   */
  async cloneRepo(projectId: string, repo: Repository): Promise<{ success: boolean; message?: string }> {
    try {
      const response = await this.binding.fetch(
        new Request(`http://fake/sandboxes/${projectId}/clone`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            repoUrl: repo.clone_url,
            githubToken: this.githubToken,
          }),
        })
      );

      const data = await response.json() as any;

      // Improved error messages - don't use fallback when it fails
      if (!data.success) {
        return {
          success: false,
          message: data.error || data.data?.message || 'Failed to clone repository'
        };
      }

      return {
        success: true,
        message: data.data?.message || `Successfully cloned ${repo.name}`
      };
    } catch (error) {
      console.error(`Failed to clone repo ${repo.name}:`, error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Execute a command in the sandbox
   */
  async execCommand(projectId: string, command: string): Promise<{
    success: boolean;
    stdout?: string;
    stderr?: string;
    exitCode?: number;
    error?: string;
  }> {
    try {
      const response = await this.binding.fetch(
        new Request(`http://fake/sandboxes/${projectId}/exec`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command }),
        })
      );

      const data = await response.json() as any;
      console.log('[SandboxClient] Exec command response:', JSON.stringify(data, null, 2));

      if (!data.success) {
        return {
          success: false,
          error: data.error || 'Command execution failed'
        };
      }

      return {
        success: true,
        stdout: data.data?.stdout || '',
        stderr: data.data?.stderr || '',
        exitCode: data.data?.exitCode || 0
      };
    } catch (error) {
      console.error('Failed to execute command:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}
