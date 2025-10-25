import {
  pgTable,
  uuid,
  text,
  timestamp,
  varchar,
  pgEnum,
  jsonb,
  integer,
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ===========================
// ENUMS
// ===========================

export const roleEnum = pgEnum("role", ["owner", "member"]);
export const runStatusEnum = pgEnum("run_status", [
  "pending",
  "running",
  "completed",
  "failed",
]);
export const instrumentationStatusEnum = pgEnum("instrumentation_status", [
  "pending",
  "generating",
  "completed",
]);
export const providerEnum = pgEnum("provider", ["github"]);

// ===========================
// TABLES
// ===========================

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  githubId: text("github_id").unique().notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }),
  avatarUrl: text("avatar_url"),
  onboardingStep: integer("onboarding_step").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const orgs = pgTable("orgs", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  createdByUserId: uuid("created_by_user_id")
    .references(() => users.id)
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const orgMembers = pgTable(
  "org_members",
  {
    orgId: uuid("org_id")
      .references(() => orgs.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    role: roleEnum("role").default("member").notNull(),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.orgId, table.userId] }),
  })
);

export const integrations = pgTable("integrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  provider: providerEnum("provider").notNull(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const repos = pgTable("repos", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .references(() => orgs.id, { onDelete: "cascade" })
    .notNull(),
  githubRepoId: text("github_repo_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  fullName: varchar("full_name", { length: 255 }).notNull(),
  cloneUrl: text("clone_url").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .references(() => orgs.id, { onDelete: "cascade" })
    .notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const projectRepos = pgTable(
  "project_repos",
  {
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    repoId: uuid("repo_id")
      .references(() => repos.id, { onDelete: "cascade" })
      .notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.projectId, table.repoId] }),
  })
);

export const runs = pgTable("runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  status: runStatusEnum("status").default("pending").notNull(),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const productMetrics = pgTable("product_metrics", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  runId: uuid("run_id")
    .references(() => runs.id, { onDelete: "cascade" })
    .notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  featureName: varchar("feature_name", { length: 255 }).notNull(),
  metricType: varchar("metric_type", { length: 100 }).notNull(),
  sqlQuery: text("sql_query"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const instrumentations = pgTable("instrumentations", {
  id: uuid("id").primaryKey().defaultRandom(),
  productMetricId: uuid("product_metric_id")
    .references(() => productMetrics.id, { onDelete: "cascade" })
    .notNull(),
  content: text("content"),
  status: instrumentationStatusEnum("status").default("pending").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const prs = pgTable("prs", {
  id: uuid("id").primaryKey().defaultRandom(),
  productMetricId: uuid("product_metric_id")
    .references(() => productMetrics.id, { onDelete: "cascade" })
    .notNull(),
  githubPrId: text("github_pr_id").notNull(),
  url: text("url").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ===========================
// RELATIONS
// ===========================

export const usersRelations = relations(users, ({ many }) => ({
  orgMemberships: many(orgMembers),
  createdOrgs: many(orgs),
  integrations: many(integrations),
}));

export const orgsRelations = relations(orgs, ({ one, many }) => ({
  creator: one(users, {
    fields: [orgs.createdByUserId],
    references: [users.id],
  }),
  members: many(orgMembers),
  repos: many(repos),
  projects: many(projects),
}));

export const orgMembersRelations = relations(orgMembers, ({ one }) => ({
  org: one(orgs, {
    fields: [orgMembers.orgId],
    references: [orgs.id],
  }),
  user: one(users, {
    fields: [orgMembers.userId],
    references: [users.id],
  }),
}));

export const integrationsRelations = relations(integrations, ({ one }) => ({
  user: one(users, {
    fields: [integrations.userId],
    references: [users.id],
  }),
}));

export const reposRelations = relations(repos, ({ one, many }) => ({
  org: one(orgs, {
    fields: [repos.orgId],
    references: [orgs.id],
  }),
  projectRepos: many(projectRepos),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  org: one(orgs, {
    fields: [projects.orgId],
    references: [orgs.id],
  }),
  projectRepos: many(projectRepos),
  runs: many(runs),
  productMetrics: many(productMetrics),
}));

export const projectReposRelations = relations(projectRepos, ({ one }) => ({
  project: one(projects, {
    fields: [projectRepos.projectId],
    references: [projects.id],
  }),
  repo: one(repos, {
    fields: [projectRepos.repoId],
    references: [repos.id],
  }),
}));

export const runsRelations = relations(runs, ({ one, many }) => ({
  project: one(projects, {
    fields: [runs.projectId],
    references: [projects.id],
  }),
  productMetrics: many(productMetrics),
}));

export const productMetricsRelations = relations(
  productMetrics,
  ({ one, many }) => ({
    project: one(projects, {
      fields: [productMetrics.projectId],
      references: [projects.id],
    }),
    run: one(runs, {
      fields: [productMetrics.runId],
      references: [runs.id],
    }),
    instrumentations: many(instrumentations),
    prs: many(prs),
  })
);

export const instrumentationsRelations = relations(
  instrumentations,
  ({ one }) => ({
    productMetric: one(productMetrics, {
      fields: [instrumentations.productMetricId],
      references: [productMetrics.id],
    }),
  })
);

export const prsRelations = relations(prs, ({ one }) => ({
  productMetric: one(productMetrics, {
    fields: [prs.productMetricId],
    references: [productMetrics.id],
  }),
}));
