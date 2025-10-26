import * as z from "zod/v4";
import type { Fetcher } from '@cloudflare/workers-types';
import { registry } from "@langchain/langgraph/zod";

// Cloudflare Environment bindings
export type Env = {
  E2B_API_KEY: string;
  AGENT_SESSION: DurableObjectNamespace;
  ANTHROPIC_API_KEY: string;
  WEB_WORKER_URL: string; // URL to web-worker for HTTP callbacks
  // LangSmith tracing (optional)
  LANGSMITH_TRACING?: string;
  LANGSMITH_ENDPOINT?: string;
  LANGSMITH_API_KEY?: string;
  LANGSMITH_PROJECT?: string;
};

// Request to start a run
export type RunStartRequest = {
  runId: string;
  projectId: string;
  repos: Repository[];
};

export type Repository = {
  id: string;
  name: string;
  clone_url: string;
};

// ============================================================================
// Structured Output Schemas
// ============================================================================

// Topic schema (output from Topic Detection Agent)
export const TopicSchema = z.object({
  name: z.string().describe("Topic/feature name (e.g., 'Authentication', 'Payments', 'Dashboard')"),
  description: z.string().describe("What this topic/feature does"),
  relatedFiles: z.array(z.string()).describe("Key files for this topic (relative paths)"),
});

export const TopicsOutputSchema = z.object({
  topics: z.array(TopicSchema).max(3).describe("Detected topics (maximum 3)"),
});

export type Topic = z.infer<typeof TopicSchema>;

// Metric schema (output from Metric Generator Agent)
export const MetricSchema = z.object({
  name: z.string().describe("Name of the metric"),
  description: z.string().describe("Description of what this metric measures"),
  featureName: z.string().describe("Name of the feature this metric belongs to (e.g., 'Authentication', 'Payments', 'Dashboard')"),
  metricType: z.enum([
    "conversion",
    "engagement",
    "frequency",
    "performance",
    "retention",
    "revenue",
    "adoption",
    "satisfaction"
  ]).describe("Type of metric"),
  sqlQuery: z.string().describe("Suggested SQL query to calculate this metric. Use placeholder table names like 'events', 'users', etc."),
  relatedFiles: z.array(z.string()).describe("List of files related to this metric (relative paths)"),
});

export const MetricsOutputSchema = z.object({
  metrics: z.array(MetricSchema).describe("Generated product metrics"),
});

export type Metric = z.infer<typeof MetricSchema>;

// For backward compatibility with web-worker
export type ProductMetric = {
  title: string;
  description: string;
  featureName: string;
  metricType: string;
  sqlQuery: string;
  metadata?: {
    relatedFiles?: string[];
  };
};

// Review schema (output from Metric Reviewer Agent)
export const ReviewSchema = z.object({
  approved: z.boolean().describe("Whether this metric passes review"),
  reasoning: z.string().describe("Why this metric was approved or rejected"),
  improvements: z.string().optional().describe("Suggestions for improvement if rejected"),
});

export const ReviewOutputSchema = z.object({
  approved: z.boolean(),
  reasoning: z.string(),
  improvements: z.string().optional(),
});

export type Review = z.infer<typeof ReviewSchema>;

// ============================================================================
// Graph State (for multi-agent workflow)
// ============================================================================

// State schema using Zod v4 with reducers
export const GraphStateSchema = z.object({
  runId: z.string(),
  projectId: z.string(),
  repos: z.array(z.custom<Repository>()),
  githubToken: z.string().optional(),

  // Step 1: Topic Detection
  topics: z.array(z.custom<Topic>()).default(() => []),

  // Step 2: Metric Generation (parallelized per topic)
  // Reducer accumulates metrics from parallel workers
  allMetrics: z.array(z.custom<Metric>())
    .default(() => [])
    .register(registry, {
      reducer: {
        fn: (prev, next) => {
          // next can be a single Metric or an array of Metrics
          return Array.isArray(next) ? [...prev, ...next] : [...prev, next];
        },
      },
    }),

  // Step 3: Metric Review (parallelized per metric)
  // Reducer accumulates reviews from parallel workers
  reviews: z.array(z.custom<Review>())
    .default(() => [])
    .register(registry, {
      reducer: {
        fn: (prev, next) => {
          // next can be a single Review or an array of Reviews
          return Array.isArray(next) ? [...prev, ...next] : [...prev, next];
        },
      },
    }),

  // Step 4: Filtered results
  approvedMetrics: z.array(z.custom<Metric>()).default(() => []),

  // Error tracking
  errors: z.array(z.string())
    .default(() => [])
    .register(registry, {
      reducer: {
        fn: (prev, next) => {
          // next can be a single error string or an array of error strings
          return Array.isArray(next) ? [...prev, ...next] : [...prev, next];
        },
      },
    }),
});

export type GraphState = z.infer<typeof GraphStateSchema>;
