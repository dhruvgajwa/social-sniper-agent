import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { ApprovalStore } from "../../approvals/store";

// Initialize approval store
const approvalStore = new ApprovalStore(process.env.APPROVAL_DB_URL || "file:./approvals.db");

// Initialize store on module load
approvalStore.init().catch((error) => {
  console.error("❌ Failed to initialize approval store:", error);
});

export const notificationTool = createTool({
  id: "notification",
  description: `
    Sends draft responses to Telegram or Slack for human approval before posting.
    Implements the human-in-the-loop approval system.
    Saves drafts to database for webhook handlers to retrieve.
  `,
  inputSchema: z.object({
    platform: z.enum(["telegram", "slack"]).describe("Which notification platform to use"),
    draftResponse: z.string().describe("The draft response to send for approval"),
    sourcePost: z
      .object({
        platform: z.string(),
        postId: z.string(),
        author: z.string(),
        text: z.string(),
        url: z.string(),
      })
      .describe("Information about the source post"),
    recommendedEvents: z
      .array(z.string())
      .describe("Event names or descriptions to include in the notification"),
  }),
  outputSchema: z.object({
    sent: z.boolean(),
    notificationId: z.string().optional(),
    error: z.string().optional(),
  }),
  execute: async ({ context }) => {
    const { platform, draftResponse, sourcePost, recommendedEvents } = context;

    try {
      // Save draft to database first
      const draft = await approvalStore.saveDraft({
        platform: sourcePost.platform as "reddit" | "twitter",
        postId: sourcePost.postId,
        postUrl: sourcePost.url,
        postAuthor: sourcePost.author,
        postContent: sourcePost.text,
        draftResponse,
        recommendedEvents,
        status: "pending",
      });

      console.log(`💾 Saved draft to database with notification ID: ${draft.notificationId}`);

      // Send notification with notification ID
      if (platform === "telegram") {
        return await sendTelegramNotification(
          draft.notificationId,
          draftResponse,
          sourcePost,
          recommendedEvents
        );
      } else {
        return await sendSlackNotification(
          draft.notificationId,
          draftResponse,
          sourcePost,
          recommendedEvents
        );
      }
    } catch (error: any) {
      return {
        sent: false,
        error: error.message,
      };
    }
  },
});

async function sendTelegramNotification(
  notificationId: string,
  draftResponse: string,
  sourcePost: any,
  events: string[]
): Promise<{ sent: boolean; notificationId?: string; error?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    throw new Error("Telegram credentials not configured");
  }

  const message = `
🎯 **New High-Intent Post Detected**

📱 **Platform:** ${sourcePost.platform}
👤 **Author:** ${sourcePost.author}
🔗 **Post URL:** ${sourcePost.url}

📝 **Original Post:**
${sourcePost.text}

---

✍️ **Proposed Response:**
${draftResponse}

---

🎉 **Recommended Events:**
${events.map((e) => `• ${e}`).join("\n")}

---

**Notification ID:** \`${notificationId}\`

Reply with:
✅ /approve ${notificationId}
❌ /reject ${notificationId}
✏️ /edit ${notificationId} [your message]
  `.trim();

  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: "Markdown",
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Telegram API error: ${data.description}`);
  }

  return {
    sent: true,
    notificationId: notificationId,
  };
}

async function sendSlackNotification(
  notificationId: string,
  draftResponse: string,
  sourcePost: any,
  events: string[]
): Promise<{ sent: boolean; notificationId?: string; error?: string }> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;

  if (!webhookUrl) {
    throw new Error("Slack webhook URL not configured");
  }

  const message = {
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "🎯 New High-Intent Post Detected",
        },
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Platform:*\n${sourcePost.platform}`,
          },
          {
            type: "mrkdwn",
            text: `*Author:*\n${sourcePost.author}`,
          },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Original Post:*\n${sourcePost.text}`,
        },
      },
      {
        type: "divider",
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Proposed Response:*\n${draftResponse}`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Recommended Events:*\n${events.map((e) => `• ${e}`).join("\n")}`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Notification ID:* \`${notificationId}\``,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "✅ Approve",
            },
            style: "primary",
            action_id: "approve",
            value: notificationId,
          },
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "❌ Reject",
            },
            style: "danger",
            action_id: "reject",
            value: notificationId,
          },
        ],
      },
    ],
  };

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });

  if (!response.ok) {
    throw new Error(`Slack webhook error: ${response.statusText}`);
  }

  return {
    sent: true,
    notificationId: notificationId,
  };
}
