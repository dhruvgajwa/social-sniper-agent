import "dotenv/config";
import { MCPServer } from "@mastra/mcp";

// Agents
import {
    intentClassifierAgent,
    eventRecommenderAgent,
    responseWriterAgent,
    queryToParamsAgent,
} from "./mastra";

// Core tools (read-only / generative — safe to expose via MCP)
import { eventSearchTool } from "./mastra/tools/event-search";
import { geocodingTool } from "./mastra/tools/geocoding";
import { intentToTagsTool } from "./mastra/tools/intent-to-tags";

// Parameter extraction tools
import { coordinatesTool } from "./mastra/tools/params/coordinates";
import { tagsTool } from "./mastra/tools/params/tags";
import { radiusTool } from "./mastra/tools/params/radius";
import { whenTool } from "./mastra/tools/params/when";
import { budgetTool } from "./mastra/tools/params/budget";
import { limitTool } from "./mastra/tools/params/limit";

/**
 * Happenings MCP Server
 *
 * Exposes event discovery tools and AI agents via the Model Context Protocol.
 * Any MCP client (Claude Desktop, Cursor, Windsurf, etc.) can connect and use
 * these capabilities to search for events, classify intent, and get recommendations.
 *
 * Exposed tools (9): event-search, geocoding, intent-to-tags,
 *   coordinates, tags, radius, when, budget, limit
 *
 * Exposed agents (4 → auto-converted to ask_<name> tools):
 *   ask_eventRecommenderAgent  — NL query → event recommendations
 *   ask_queryToParamsAgent     — NL query → structured search parameters
 *   ask_intentClassifierAgent  — text → HIGH/LOW intent classification
 *   ask_responseWriterAgent    — events + context → formatted response
 *
 * Excluded (internal/mutation tools): reddit-monitor, post-to-platform,
 *   notification, twitter-monitor — these require auth and perform mutations.
 */
export const mcpServer = new MCPServer({
    id: "happenings-events",
    name: process.env.MCP_SERVER_NAME || "happenings-events",
    version: "1.0.0",
    description:
        "Happenings event discovery — search events in Indian cities, get AI-powered recommendations, classify event-seeking intent, and extract structured search parameters from natural language queries.",
    instructions: `Use the available tools to help users discover events. 
For simple event searches, use the "event-search" tool with a city name and optional tags.
For natural language queries like "jazz events in Bangalore this weekend", use "ask_eventRecommenderAgent" which handles the full pipeline (location resolution, tag extraction, search, and recommendation).
Use "ask_queryToParamsAgent" to convert queries into structured API parameters.
Use "ask_intentClassifierAgent" to check if a piece of text contains event-seeking intent.
The parameter tools (coordinates, tags, radius, when, budget, limit) can be composed for fine-grained control.`,

    tools: {
        eventSearchTool,
        geocodingTool,
        intentToTagsTool,
        coordinatesTool,
        tagsTool,
        radiusTool,
        whenTool,
        budgetTool,
        limitTool,
    },

    agents: {
        eventRecommenderAgent,
        queryToParamsAgent,
        intentClassifierAgent,
        responseWriterAgent,
    },
});
