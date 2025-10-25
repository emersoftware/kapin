import { auth } from "@/lib/auth/config";
import { GitHubClient } from "@/lib/github/client";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q") || "";
    const limit = parseInt(searchParams.get("limit") || "100");

    // Create GitHub client for user
    const githubClient = await GitHubClient.forUser(session.user.id);

    if (!githubClient) {
      return NextResponse.json(
        { error: "GitHub integration not found" },
        { status: 404 }
      );
    }

    // Search repositories
    const result = await githubClient.searchRepositories(query, limit);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error searching GitHub repositories:", error);
    return NextResponse.json(
      { error: "Failed to search repositories" },
      { status: 500 }
    );
  }
}
