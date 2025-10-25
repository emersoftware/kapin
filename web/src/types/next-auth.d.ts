import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      githubId: string;
      onboardingStep: number;
    } & DefaultSession["user"];
  }
}
