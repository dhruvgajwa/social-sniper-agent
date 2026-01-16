import { Mastra } from "@mastra/core/mastra";
import { LibSQLStore } from "@mastra/libsql";
import { PinoLogger } from "@mastra/loggers";

// Import agents
import { intentClassifierAgent } from "./agents/intent-classifier";
import { eventRecommenderAgent } from "./agents/event-recommender";
import { responseWriterAgent } from "./agents/response-writer";
import { queryToParamsAgent } from "./agents/query-to-params";

// Import workflows
import { socialSniperWorkflow } from "./workflows/social-sniper-pipeline";

/**
 * Main Mastra Instance
 *
 * Configures:
 * - 4 AI Agents:
 *   - intentClassifierAgent: Detects event-seeking intent (HIGH/LOW)
 *   - eventRecommenderAgent: Finds matching events (works independently)
 *   - responseWriterAgent: Crafts human-like responses with Happenings URLs
 *   - queryToParamsAgent: Converts queries to search parameters (for direct site use)
 * - 1 Workflow (mention-based social sniper pipeline)
 * - Storage (LibSQL for workflow state)
 * - Logging (Pino for structured logs)
 * 
 * Note: Tools auto-register and don't need to be listed here.
 */
export const mastra = new Mastra({
  agents: {
    intentClassifierAgent,
    eventRecommenderAgent,
    responseWriterAgent,
    queryToParamsAgent,
  },

  workflows: {
    socialSniperWorkflow,
  },

  storage: new LibSQLStore({
    url: ":memory:", // Use file://mastra.db for persistence
  }),

  logger: new PinoLogger({
    name: "HappeningsBot",
    level: "info",
  }),
});

// Export agents for independent use
export {
  intentClassifierAgent,
  eventRecommenderAgent,
  responseWriterAgent,
  queryToParamsAgent,
};
