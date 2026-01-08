/**
 * Express Webhook Server
 *
 * Runs on port specified by WEBHOOK_PORT (default: 3000)
 * Handles approval webhooks from Telegram and Slack
 *
 * Environment Variables:
 * - WEBHOOK_PORT: Server port (default: 3000)
 * - WEBHOOK_ENABLED: Enable webhook server (default: "true" when AUTO_APPROVE=false)
 */

import express from "express";
import { handleTelegramWebhook, handleSlackWebhook } from "./approvals/webhooks";

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    service: "social-sniper-webhooks",
    timestamp: new Date().toISOString(),
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
 * Start webhook server
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

  app.listen(port, () => {
    console.log(`\n🌐 Webhook server started on port ${port}`);
    console.log(`   Telegram: POST http://localhost:${port}/webhooks/telegram`);
    console.log(`   Slack:    POST http://localhost:${port}/webhooks/slack`);
    console.log(`   Health:   GET  http://localhost:${port}/health\n`);
  });
}

export { app };
