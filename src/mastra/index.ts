import { Mastra } from "@mastra/core/mastra";
import { LibSQLStore } from "@mastra/libsql";
import { PinoLogger } from "@mastra/loggers";

// Import agents
import { intentClassifierAgent } from "./agents/intent-classifier";
import { eventRecommenderAgent } from "./agents/event-recommender";
import { responseWriterAgent } from "./agents/response-writer";

// Import tools
import { redditMonitorTool } from "./tools/reddit-monitor";
import { twitterMonitorTool } from "./tools/twitter-monitor";
import { eventSearchTool } from "./tools/event-search";
import { notificationTool } from "./tools/notification";

// Import workflows
import { socialSniperWorkflow } from "./workflows/social-sniper-pipeline";

/**
 * Main Mastra Instance
 *
 * Configures:
 * - 3 AI Agents (intent classifier, event recommender, response writer)
 * - 4 Tools (reddit, twitter, event search, notifications)
 * - 1 Workflow (complete social sniper pipeline)
 * - Storage (LibSQL for workflow state)
 * - Logging (Pino for structured logs)
 */
export const mastra = new Mastra({
  agents: {
    intentClassifierAgent,
    eventRecommenderAgent,
    responseWriterAgent,
  },

  workflows: {
    socialSniperWorkflow,
  },

  storage: new LibSQLStore({
    url: ":memory:", // Use file://mastra.db for persistence
  }),

  logger: new PinoLogger({
    name: "SocialSniper",
    level: "info",
  }),
});
