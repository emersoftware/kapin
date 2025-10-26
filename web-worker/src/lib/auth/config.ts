import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import type { GitHubProfile } from "next-auth/providers/github";
import { db } from "@/lib/db";
import { users, integrations, orgs, orgMembers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  providers: [
    GitHub({
      clientId: process.env.GITHUB_APP_CLIENT_ID!,
      clientSecret: process.env.GITHUB_APP_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: "read:user user:email repo",
        },
      },
    }),
  ],
  // TODO: Uncomment if session is null in Cloudflare production deployment
  // cookies: {
  //   sessionToken: {
  //     name: `__Secure-next-auth.session-token`,
  //     options: {
  //       httpOnly: true,
  //       sameSite: 'lax',
  //       path: '/',
  //       secure: process.env.NODE_ENV === 'production',
  //     },
  //   },
  // },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (!account || !profile) return false;

      const githubProfile = profile as unknown as GitHubProfile;
      const githubId = String(githubProfile.id);

      try {
        // Check if user exists
        const existingUser = await db.query.users.findFirst({
          where: eq(users.githubId, githubId),
        });

        let userId: string;

        if (!existingUser) {
          // Create new user
          const newUserData: typeof users.$inferInsert = {
            githubId,
            email: githubProfile.email || "",
            name: githubProfile.name || githubProfile.login || "",
            avatarUrl: githubProfile.avatar_url,
            onboardingStep: 1,
          };

          const [newUser] = await db
            .insert(users)
            .values(newUserData)
            .returning();

          userId = newUser.id;

          // Create default org for the user
          const [newOrg] = await db
            .insert(orgs)
            .values({
              name: `${githubProfile.login}-org`,
              createdByUserId: userId,
            })
            .returning();

          // Add user as org owner
          await db.insert(orgMembers).values({
            orgId: newOrg.id,
            userId: userId,
            role: "owner",
          });
        } else {
          userId = existingUser.id;
        }

        // Upsert GitHub integration
        await db
          .insert(integrations)
          .values({
            userId: userId,
            provider: "github",
            accessToken: account.access_token || "",
            refreshToken: account.refresh_token || null,
          })
          .onConflictDoUpdate({
            target: [integrations.userId, integrations.provider],
            set: {
              accessToken: account.access_token || "",
              refreshToken: account.refresh_token || null,
            },
          });

        return true;
      } catch (error) {
        console.error("Error in signIn callback:", error);
        return false;
      }
    },
    async session({ session, token }) {
      if (token.sub && session.user) {
        // Get user from database
        const dbUser = await db.query.users.findFirst({
          where: eq(users.githubId, token.sub),
        });

        if (dbUser) {
          session.user.id = dbUser.id;
          session.user.githubId = dbUser.githubId;
          session.user.onboardingStep = dbUser.onboardingStep;
        }
      }
      return session;
    },
    async jwt({ token, account, profile }) {
      if (account && profile) {
        const githubProfile = profile as unknown as GitHubProfile;
        token.sub = String(githubProfile.id);
      }
      return token;
    },
  },
  pages: {
    signIn: "/", // Redirect to home page for sign in
  },
});
