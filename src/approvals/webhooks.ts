/**
 * Webhook Handlers
 *
 * Handles approval webhooks from Telegram and Slack.
 * Supports commands: approve, reject, edit
 *
 * Environment Variables Used:
 * - TELEGRAM_BOT_TOKEN: Telegram bot authentication
 * - SLACK_SIGNING_SECRET: Slack request verification
 * - APPROVAL_NOTIFICATION_CHANNEL: "telegram" or "slack"
 */

import { Request, Response } from "express";
import crypto from "crypto";
import { ApprovalStore } from "./store";
import { postToPlatformTool } from "../mastra/tools/post-to-platform";

// Initialize approval store
const approvalStore = new ApprovalStore(process.env.APPROVAL_DB_URL || "file:./approvals.db");

/**
 * Telegram Webhook Handler
 *
 * Handles Telegram bot commands:
 * - /approve <notification_id>
 * - /reject <notification_id>
 * - /edit <notification_id> <new_response>
 */
export async function handleTelegramWebhook(req: Request, res: Response) {
  try {
    const update = req.body;

    // Check if it's a message
    if (!update.message || !update.message.text) {
      return res.status(200).json({ ok: true });
    }

    const chatId = update.message.chat.id;
    const text = update.message.text;
    const username = update.message.from?.username || "unknown";

    console.log(`📱 Telegram command received: ${text} from ${username}`);

    // Parse command
    const parts = text.trim().split(/\s+/);
    const command = parts[0].toLowerCase();
    const notificationId = parts[1];

    if (!notificationId) {
      await sendTelegramMessage(
        chatId,
        "❌ Please provide a notification ID.\n\nUsage:\n/approve <id>\n/reject <id>\n/edit <id> <new_response>"
      );
      return res.status(200).json({ ok: true });
    }

    // Get draft from database
    const draft = await approvalStore.getDraftByNotificationId(notificationId);

    if (!draft) {
      await sendTelegramMessage(
        chatId,
        `❌ Draft not found for notification ID: ${notificationId}`
      );
      return res.status(200).json({ ok: true });
    }

    // Handle commands
    switch (command) {
      case "/approve":
        await handleApprove(draft, username, chatId);
        break;

      case "/reject":
        await handleReject(draft, username, chatId);
        break;

      case "/edit":
        const newResponse = parts.slice(2).join(" ");
        if (!newResponse) {
          await sendTelegramMessage(
            chatId,
            "❌ Please provide the edited response.\n\nUsage: /edit <id> <new_response>"
          );
        } else {
          await handleEdit(draft, newResponse, username, chatId);
        }
        break;

      default:
        await sendTelegramMessage(
          chatId,
          `❌ Unknown command: ${command}\n\nSupported commands:\n/approve <id>\n/reject <id>\n/edit <id> <new_response>`
        );
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error("❌ Telegram webhook error:", error);
    res.status(500).json({ ok: false, error: "Internal server error" });
  }
}

/**
 * Slack Webhook Handler
 *
 * Handles Slack interactive messages (button clicks).
 * Expects payload with action: approve, reject, or edit
 */
export async function handleSlackWebhook(req: Request, res: Response) {
  try {
    // Verify Slack signature if SLACK_SIGNING_SECRET is set
    const slackSigningSecret = process.env.SLACK_SIGNING_SECRET;
    if (slackSigningSecret) {
      const isValid = verifySlackSignature(req, slackSigningSecret);
      if (!isValid) {
        console.error("❌ Invalid Slack signature");
        return res.status(401).json({ error: "Invalid signature" });
      }
    }

    // Parse payload
    const payload = JSON.parse(req.body.payload);
    const action = payload.actions?.[0];
    const notificationId = action?.value;
    const username = payload.user?.username || "unknown";

    if (!action || !notificationId) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    console.log(`💼 Slack action received: ${action.action_id} from ${username}`);

    // Get draft from database
    const draft = await approvalStore.getDraftByNotificationId(notificationId);

    if (!draft) {
      return res.status(200).json({
        text: `❌ Draft not found for notification ID: ${notificationId}`,
      });
    }

    // Handle actions
    switch (action.action_id) {
      case "approve":
        await handleApprove(draft, username, null);
        res.status(200).json({
          text: `✅ Approved! Posting response to ${draft.platform}...`,
        });
        break;

      case "reject":
        await handleReject(draft, username, null);
        res.status(200).json({
          text: `❌ Rejected. Draft discarded.`,
        });
        break;

      case "edit":
        // For edit, Slack would need to open a modal - simplified version here
        res.status(200).json({
          text: `✏️ Edit feature requires modal interaction. Use Telegram for inline editing.`,
        });
        break;

      default:
        res.status(400).json({ error: "Unknown action" });
    }
  } catch (error) {
    console.error("❌ Slack webhook error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * Handle approve action
 */
async function handleApprove(draft: any, approvedBy: string, telegramChatId: number | null) {
  console.log(`✅ Approving draft ${draft.notificationId} by ${approvedBy}`);

  // Update status in database
  await approvalStore.approveDraft(draft.notificationId, approvedBy);

  // Post to platform
  const responseToPost = draft.editedResponse || draft.draftResponse;

  const result = await postToPlatformTool.execute({
    context: {
      platform: draft.platform,
      postId: draft.postId,
      message: responseToPost,
    },
    runtimeContext: {} as any,
  });

  if (result.posted) {
    const message = `✅ Posted successfully!\n\n🔗 ${result.postedUrl}`;
    console.log(message);

    if (telegramChatId) {
      await sendTelegramMessage(telegramChatId, message);
    }
  } else {
    const message = `❌ Failed to post: ${result.error}`;
    console.error(message);

    if (telegramChatId) {
      await sendTelegramMessage(telegramChatId, message);
    }
  }
}

/**
 * Handle reject action
 */
async function handleReject(draft: any, rejectedBy: string, telegramChatId: number | null) {
  console.log(`❌ Rejecting draft ${draft.notificationId} by ${rejectedBy}`);

  // Update status in database
  await approvalStore.rejectDraft(draft.notificationId, rejectedBy);

  const message = `❌ Draft rejected and discarded.`;

  if (telegramChatId) {
    await sendTelegramMessage(telegramChatId, message);
  }
}

/**
 * Handle edit action
 */
async function handleEdit(
  draft: any,
  newResponse: string,
  editedBy: string,
  telegramChatId: number | null
) {
  console.log(`✏️ Editing draft ${draft.notificationId} by ${editedBy}`);

  // Update draft with new response
  await approvalStore.editDraft(draft.notificationId, newResponse, editedBy);

  // Auto-post edited version if APPROVE_EDITED_IMMEDIATELY is true
  if (process.env.APPROVE_EDITED_IMMEDIATELY === "true") {
    const result = await postToPlatformTool.execute({
      context: {
        platform: draft.platform,
        postId: draft.postId,
        message: newResponse,
      },
      runtimeContext: {} as any,
    });

    if (result.posted) {
      const message = `✅ Edited and posted successfully!\n\n🔗 ${result.postedUrl}`;
      console.log(message);

      if (telegramChatId) {
        await sendTelegramMessage(telegramChatId, message);
      }
    } else {
      const message = `❌ Failed to post edited version: ${result.error}`;
      console.error(message);

      if (telegramChatId) {
        await sendTelegramMessage(telegramChatId, message);
      }
    }
  } else {
    const message = `✏️ Draft edited. Use /approve ${draft.notificationId} to post.`;

    if (telegramChatId) {
      await sendTelegramMessage(telegramChatId, message);
    }
  }
}

/**
 * Send message to Telegram
 */
async function sendTelegramMessage(chatId: number, text: string): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    console.error("❌ TELEGRAM_BOT_TOKEN not set");
    return;
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
      }),
    });

    if (!response.ok) {
      console.error("❌ Failed to send Telegram message:", await response.text());
    }
  } catch (error) {
    console.error("❌ Error sending Telegram message:", error);
  }
}

/**
 * Verify Slack request signature
 */
function verifySlackSignature(req: Request, signingSecret: string): boolean {
  const slackSignature = req.headers["x-slack-signature"] as string;
  const slackTimestamp = req.headers["x-slack-request-timestamp"] as string;

  if (!slackSignature || !slackTimestamp) {
    return false;
  }

  // Check timestamp is within 5 minutes
  const currentTime = Math.floor(Date.now() / 1000);
  if (Math.abs(currentTime - parseInt(slackTimestamp)) > 300) {
    return false;
  }

  // Verify signature
  const sigBasestring = `v0:${slackTimestamp}:${JSON.stringify(req.body)}`;
  const mySignature =
    "v0=" + crypto.createHmac("sha256", signingSecret).update(sigBasestring).digest("hex");

  return crypto.timingSafeEqual(Buffer.from(mySignature), Buffer.from(slackSignature));
}

/**
 * Initialize approval store on module load
 */
approvalStore.init().catch((error) => {
  console.error("❌ Failed to initialize approval store:", error);
});
