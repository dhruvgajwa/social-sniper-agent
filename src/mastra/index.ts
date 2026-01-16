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
 * - Storage (LibSQL for workflow state and trace persistence)
 * - Logging (Pino for structured logs)
 * - Observability (AI Tracing with DefaultExporter and ConsoleExporter)
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

  // Persistent storage (required for AI tracing)
  storage: new LibSQLStore({
    url: "file:./mastra.db",
  }),

  logger: new PinoLogger({
    name: "HappeningsBot",
    level: "info",
  }),

  // AI Tracing Configuration
  // When enabled: true, Mastra automatically includes:
  // - DefaultExporter (persists to storage)
  // - SensitiveDataFilter (redacts API keys, tokens, PII)
  // - "always" sampling (100% of traces)
  // For production, optionally add CloudExporter with MASTRA_CLOUD_ACCESS_TOKEN
  observability: {
    default: { enabled: true },
  },

  // Disable deprecated OTEL telemetry to suppress warnings
  telemetry: { enabled: false },
});

// Export agents for independent use
export {
  intentClassifierAgent,
  eventRecommenderAgent,
  responseWriterAgent,
  queryToParamsAgent,
};
