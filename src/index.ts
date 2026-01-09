import "dotenv/config";
import { mastra } from "./mastra";
import { startWebhookServer } from "./server";

/**
 * Example: Running the Social Sniper workflow manually
 *
 * In production, you'd trigger this on a schedule (cron job, Inngest, etc.)
 * or via an API endpoint.
 */
async function runSocialSniperAgent() {
  console.log("🎯 Starting Social Sniper Agent...\n");

  // Start webhook server if needed (auto-disabled if AUTO_APPROVE=true)
  startWebhookServer();

  const workflow = mastra.getWorkflow("socialSniperWorkflow");

  if (!workflow) {
    console.error("❌ Workflow not found!");
    return;
  }

  const run = await workflow.createRunAsync();

  console.log("📡 Monitoring social channels...");

  const result = await run.start({
    inputData: {
      platforms: ["reddit", "twitter"],
      cities: ["Bangalore", "Mumbai", "Delhi", "Pune", "Hyderabad"],
    },
  });

  console.log("\n✅ Workflow completed!");
  console.log(`   Status: ${result.status}`);

  if (result.status === "success") {
    const autoApproved = result.result?.autoApproved || false;

    console.log("\n📊 Results:");
    console.log(`   Mode: ${autoApproved ? "🤖 AUTO-APPROVE" : "👤 MANUAL APPROVAL"}`);
    console.log(`   High-intent posts detected: ${result.result?.highIntentDetected || 0}`);

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
        console.log("\n⚠️  No posts were made. Check logs for errors.");
      }
    } else {
      // Manual approval mode results
      console.log(`   Draft responses sent for approval: ${result.result?.draftsSent || 0}`);

      if (result.result?.pendingApproval && result.result.pendingApproval.length > 0) {
        console.log(`\n⏳ Pending approval: ${result.result.pendingApproval.length} posts`);
        console.log("   Check your Telegram/Slack for approval requests!");
        console.log("   Webhook server is running to receive approvals.");
      }
    }
  } else if (result.status === "failed") {
    console.error("\n❌ Workflow failed:", result.error);
  } else if (result.status === "suspended") {
    console.log("\n⏸️  Workflow suspended at:", result.suspended);
  }
}

// Only run the agent when this file is executed directly (not when imported)
// This prevents side-effects when other modules import `src/index.ts`.
if (import.meta.url === `file://${process.argv[1]}`) {
  runSocialSniperAgent().catch(console.error);
}
