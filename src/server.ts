/**
 * Express Webhook Server + MCP HTTP Transport
 *
 * Runs on port specified by WEBHOOK_PORT (default: 3000)
 * Handles approval webhooks from Telegram and Slack.
 * Optionally serves the Happenings MCP server over HTTP when
 * MCP_ENABLED=true and MCP_TRANSPORT includes "http".
 *
 * Environment Variables:
 * - WEBHOOK_PORT: Server port (default: 3000)
 * - WEBHOOK_ENABLED: Enable webhook server (default: "true" when AUTO_APPROVE=false)
 * - MCP_ENABLED: Enable MCP HTTP transport on this server (default: "false")
 * - MCP_TRANSPORT: "stdio", "http", or "both" (default: "stdio")
 */

import http from "node:http";
import express from "express";
import { handleTelegramWebhook, handleSlackWebhook } from "./approvals/webhooks";

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get("/health", (req, res) => {
  const mcpEnabled = process.env.MCP_ENABLED === "true";
  const mcpTransport = process.env.MCP_TRANSPORT || "stdio";
  const mcpHttpActive = mcpEnabled && (mcpTransport === "http" || mcpTransport === "both");

  res.status(200).json({
    status: "healthy",
    service: "social-sniper-webhooks",
    timestamp: new Date().toISOString(),
    mcp: {
      enabled: mcpEnabled,
      httpTransport: mcpHttpActive,
    },
  });
});

// Telegram webhook endpoint
app.post("/webhooks/telegram", handleTelegramWebhook);

// Slack webhook endpoint
app.post("/webhooks/slack", handleSlackWebhook);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("❌ Server error:", err);
  res.status(500).json({ error: "Internal server error" });
});

/**
 * Start webhook server (optionally with MCP HTTP transport)
 */
export function startWebhookServer(): void {
  const port = parseInt(process.env.WEBHOOK_PORT || "3000");
  const webhookEnabled = process.env.WEBHOOK_ENABLED !== "false";
  const autoApprove = process.env.AUTO_APPROVE === "true";

  // Only start server if webhooks are enabled and auto-approve is off
  if (!webhookEnabled || autoApprove) {
    console.log("ℹ️  Webhook server disabled (AUTO_APPROVE=true or WEBHOOK_ENABLED=false)");
    return;
  }

  const mcpEnabled = process.env.MCP_ENABLED === "true";
  const mcpTransport = process.env.MCP_TRANSPORT || "stdio";
  const mcpHttpActive = mcpEnabled && (mcpTransport === "http" || mcpTransport === "both");

  if (mcpHttpActive) {
    // Use raw http.createServer to handle MCP routes (needs raw req/res)
    // and delegate everything else to Express
    import("./mcp-server").then(({ mcpServer }) => {
      const httpServer = http.createServer(async (req, res) => {
        const url = new URL(req.url || "", `http://localhost:${port}`);

        // MCP Streamable HTTP transport
        if (url.pathname === "/mcp") {
          await mcpServer.startHTTP({ url, httpPath: "/mcp", req, res });
          return;
        }

        // MCP SSE transport (legacy fallback)
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

        // Everything else goes to Express
        app(req, res);
      });

      httpServer.listen(port, () => {
        console.log(`\n🌐 Webhook server started on port ${port}`);
        console.log(`   Telegram: POST http://localhost:${port}/webhooks/telegram`);
        console.log(`   Slack:    POST http://localhost:${port}/webhooks/slack`);
        console.log(`   Health:   GET  http://localhost:${port}/health`);
        console.log(`   🔌 MCP HTTP:  POST http://localhost:${port}/mcp`);
        console.log(`   🔌 MCP SSE:   GET  http://localhost:${port}/sse\n`);
      });
    });
  } else {
    app.listen(port, () => {
      console.log(`\n🌐 Webhook server started on port ${port}`);
      console.log(`   Telegram: POST http://localhost:${port}/webhooks/telegram`);
      console.log(`   Slack:    POST http://localhost:${port}/webhooks/slack`);
      console.log(`   Health:   GET  http://localhost:${port}/health\n`);
    });
  }
}

export { app };
