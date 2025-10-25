import { db } from "@/lib/db";
import { integrations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export interface GitHubRepository {
  id: number;
  node_id: string;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  clone_url: string;
  private: boolean;
  language?: string | null;
  fork: boolean;
  owner: {
    login: string;
    avatar_url: string;
  };
}

interface ListRepositoriesResponse {
  repositories: GitHubRepository[];
  total_count: number;
}

interface SearchRepositoriesResponse {
  repositories: GitHubRepository[];
  total_count: number;
}

export class GitHubClient {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  /**
   * Get GitHub access token for a user from the database
   */
  static async getAccessTokenForUser(userId: string): Promise<string | null> {
    const integration = await db.query.integrations.findFirst({
      where: eq(integrations.userId, userId),
    });

    return integration?.accessToken || null;
  }

  /**
   * Create a GitHubClient instance for a user
   */
  static async forUser(userId: string): Promise<GitHubClient | null> {
    const accessToken = await this.getAccessTokenForUser(userId);
    if (!accessToken) return null;
    return new GitHubClient(accessToken);
  }

  /**
   * List repositories using REST API
   * GET /user/repos
   */
  async listRepositories(
    page: number = 1,
    perPage: number = 30
  ): Promise<ListRepositoriesResponse> {
    const response = await fetch(
      `https://api.github.com/user/repos?per_page=${perPage}&page=${page}&sort=updated`,
      {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const repos: GitHubRepository[] = await response.json();

    return {
      repositories: repos,
      total_count: repos.length,
    };
  }

  /**
   * Search repositories using GraphQL API
   */
  async searchRepositories(
    searchQuery: string,
    limit: number = 100
  ): Promise<SearchRepositoriesResponse> {
    // Get the authenticated user first to scope the search
    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: "application/vnd.github+json",
      },
    });

    if (!userResponse.ok) {
      throw new Error("Failed to get user info");
    }

    const user = await userResponse.json();
    const username = user.login;

    // Sanitize search query
    const sanitizedQuery = searchQuery.trim();

    // GraphQL query
    const query = `
      query SearchRepositories($searchQuery: String!, $limit: Int!) {
        search(query: $searchQuery, type: REPOSITORY, first: $limit) {
          repositoryCount
          nodes {
            ... on Repository {
              id
              databaseId
              name
              nameWithOwner
              description
              url
              isPrivate
              isFork
              primaryLanguage {
                name
              }
              owner {
                login
                avatarUrl
              }
            }
          }
        }
      }
    `;

    // Build search query: search in user's repos + include forks + search in name
    const searchString = sanitizedQuery
      ? `user:${username} fork:true in:name ${sanitizedQuery}`
      : `user:${username} fork:true`;

    const response = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        variables: {
          searchQuery: searchString,
          limit,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`GitHub GraphQL API error: ${response.status}`);
    }

    const result = await response.json();

    if (result.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
    }

    const nodes = result.data.search.nodes;
    const repositoryCount = result.data.search.repositoryCount;

    // Map GraphQL response to REST API format
    const repositories: GitHubRepository[] = nodes.map((node: any) => ({
      id: node.databaseId,
      node_id: node.id,
      name: node.name,
      full_name: node.nameWithOwner,
      description: node.description,
      html_url: node.url,
      clone_url: `${node.url}.git`,
      private: node.isPrivate,
      language: node.primaryLanguage?.name || null,
      fork: node.isFork,
      owner: {
        login: node.owner.login,
        avatar_url: node.owner.avatarUrl,
      },
    }));

    return {
      repositories,
      total_count: repositoryCount,
    };
  }
}
