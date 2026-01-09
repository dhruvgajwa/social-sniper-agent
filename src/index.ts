import "dotenv/config";
import { mastra } from "./mastra";
import { startWebhookServer } from "./server";

/**
 * Happenings Bot - Reddit Mention Handler
 * 
 * This bot responds to mentions of u/Happenings_bot on Reddit.
 * When users mention the bot asking for event recommendations,
 * it analyzes their request, finds matching events, and generates
 * a helpful response.
 * 
 * The bot does NOT crawl or scrape subreddits - it only reacts to
 * explicit mentions from users who want event recommendations.
 * 
 * In production, run this on a schedule (every 5-15 minutes) to
 * check for new mentions.
 */
async function runHappeningsBot() {
  console.log("🎯 Starting Happenings Bot...\n");
  console.log("📬 Checking for mentions of u/Happenings_bot...\n");

  // Start webhook server if needed (auto-disabled if AUTO_APPROVE=true)
  startWebhookServer();

  const workflow = mastra.getWorkflow("socialSniperWorkflow");

  if (!workflow) {
    console.error("❌ Workflow not found!");
    return;
  }

  const run = await workflow.createRunAsync();

  const result = await run.start({
    inputData: {
      botUsername: process.env.REDDIT_BOT_USERNAME || "Happenings_bot",
      maxMentions: parseInt(process.env.MAX_MENTIONS_PER_RUN || "25"),
      freshnessHours: parseFloat(process.env.POST_FRESHNESS_HOURS || "2"),
      markAsRead: process.env.MARK_MENTIONS_AS_READ === "true",
    },
  });

  console.log("\n✅ Bot run completed!");
  console.log(`   Status: ${result.status}`);

  if (result.status === "success") {
    const autoApproved = result.result?.autoApproved || false;

    console.log("\n📊 Results:");
    console.log(`   Mode: ${autoApproved ? "🤖 AUTO-APPROVE" : "👤 MANUAL APPROVAL"}`);
    console.log(`   High-intent mentions detected: ${result.result?.highIntentDetected || 0}`);

    if (autoApproved) {
      // Auto-approve mode results
      console.log(`   Responses posted: ${result.result?.totalPosted || 0}`);

      if (result.result?.postedUrls && result.result.postedUrls.length > 0) {
        console.log("\n🔗 Posted responses:");
        result.result.postedUrls.forEach((url, idx) => {
          console.log(`   ${idx + 1}. ${url}`);
        });
      }

      if (result.result?.posted && result.result.posted.length === 0) {
        console.log("\n⚠️  No responses were posted. Check logs for errors.");
      }
    } else {
      // Manual approval mode results
      console.log(`   Draft responses sent for approval: ${result.result?.draftsSent || 0}`);

      if (result.result?.pendingApproval && result.result.pendingApproval.length > 0) {
        console.log(`\n⏳ Pending approval: ${result.result.pendingApproval.length} responses`);
        console.log("   Check your Telegram/Slack for approval requests!");
        console.log("   Webhook server is running to receive approvals.");
      }
    }
  } else if (result.status === "failed") {
    console.error("\n❌ Bot run failed:", result.error);
  } else if (result.status === "suspended") {
    console.log("\n⏸️  Workflow suspended at:", result.suspended);
  }
}

// Only run the bot when this file is executed directly (not when imported)
// This prevents side-effects when other modules import `src/index.ts`.
if (import.meta.url === `file://${process.argv[1]}`) {
  runHappeningsBot().catch(console.error);
}
