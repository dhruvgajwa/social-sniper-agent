#!/usr/bin/env node
/**
 * Happenings MCP Server — Stdio Transport
 *
 * This is the entrypoint for MCP clients that use subprocess-based communication
 * (Claude Desktop, Cursor, Windsurf, etc.).
 *
 * Usage:
 *   npx tsx src/mcp-stdio.ts
 *
 * Claude Desktop config (claude_desktop_config.json):
 *   {
 *     "mcpServers": {
 *       "happenings-events": {
 *         "command": "npx",
 *         "args": ["tsx", "/path/to/social-sniper-agent/src/mcp-stdio.ts"],
 *         "env": {
 *           "OPENAI_API_KEY": "...",
 *           "ANTHROPIC_API_KEY": "..."
 *         }
 *       }
 *     }
 *   }
 */
import { mcpServer } from "./mcp-server";

await mcpServer.startStdio();
