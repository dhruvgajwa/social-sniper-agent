#!/usr/bin/env node
/**
 * Happenings MCP Server — HTTP Streamable Transport
 *
 * Standalone HTTP server for MCP clients that connect over the network.
 * Supports modern Streamable HTTP transport and legacy SSE fallback.
 *
 * Usage:
 *   npx tsx src/mcp-http.ts
 *
 * Environment:
 *   MCP_HTTP_PORT=3001  (default)
 *
 * Endpoints:
 *   POST /mcp          — Streamable HTTP transport (recommended)
 *   GET  /sse          — SSE transport (legacy clients)
 *   POST /message      — SSE message endpoint (legacy clients)
 *   GET  /health       — Health check
 */
import "dotenv/config";
import http from "node:http";
import { mcpServer } from "./mcp-server";

const PORT = parseInt(process.env.MCP_HTTP_PORT || "3001");

const httpServer = http.createServer(async (req, res) => {
    const url = new URL(req.url || "", `http://localhost:${PORT}`);

    // Health check
    if (url.pathname === "/health" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
            JSON.stringify({
                status: "healthy",
                service: "happenings-mcp",
                transport: "http",
                timestamp: new Date().toISOString(),
            })
        );
        return;
    }

    // Streamable HTTP transport (modern)
    if (url.pathname === "/mcp") {
        await mcpServer.startHTTP({
            url,
            httpPath: "/mcp",
            req,
            res,
        });
        return;
    }

    // SSE transport (legacy fallback)
    if (url.pathname === "/sse" || url.pathname === "/message") {
        await mcpServer.startSSE({
            url,
            ssePath: "/sse",
            messagePath: "/message",
            req,
            res,
        });
        return;
    }

    // 404 for everything else
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
});

httpServer.listen(PORT, () => {
    console.log(`\n🔌 Happenings MCP Server (HTTP) started on port ${PORT}`);
    console.log(`   Streamable HTTP: POST http://localhost:${PORT}/mcp`);
    console.log(`   SSE:             GET  http://localhost:${PORT}/sse`);
    console.log(`   Health:          GET  http://localhost:${PORT}/health\n`);
});
