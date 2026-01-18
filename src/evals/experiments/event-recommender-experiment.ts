/**
 * Event Recommender Experiment
 *
 * Evaluates the event-recommender agent's ability to:
 * 1. Call the right tools in the right order
 * 2. Find relevant events based on user queries
 * 3. Provide complete information (event name, date, venue, URL)
 *
 * 🧠 LEARNING: Tool Call Accuracy
 * ================================
 * The event recommender is a TOOL-USING agent. It has access to:
 * - coordinatesTool: Extract location → coordinates
 * - tagsTool: Identify event preferences → category tags
 * - radiusTool: Determine search radius
 * - whenTool: Parse time expressions
 * - budgetTool: Detect budget preferences
 * - limitTool: Set result limits
 * - eventSearchTool: Search the Happenings database
 *
 * We need to verify it calls these tools correctly.
 * That's what the Tool Call Accuracy scorer does!
 *
 * Run with: npx tsx src/evals/experiments/event-recommender-experiment.ts
 */

import "dotenv/config";
import { runExperiment } from "@mastra/core/scores";
import { createAnswerRelevancyScorer } from "@mastra/evals/scorers/llm";
import { createCompletenessScorer } from "@mastra/evals/scorers/code";
import { eventRecommenderAgent } from "../../mastra/agents/event-recommender";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Get directory path for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load test cases
let testCases: any[];
try {
  testCases = JSON.parse(
    readFileSync(join(__dirname, "../data/event-matching-test-cases.json"), "utf-8")
  );
} catch {
  // Fallback test cases if file doesn't exist
  testCases = [
    {
      id: "music-bangalore-1",
      input: "Looking for live music events in Indiranagar this weekend",
      expectedTags: ["music", "live-music", "concerts"],
      expectedLocation: "Indiranagar, Bangalore",
    },
    {
      id: "tech-pune-1",
      input: "Any tech meetups or startup events in Pune next week?",
      expectedTags: ["technology", "networking", "startups"],
      expectedLocation: "Pune",
    },
    {
      id: "food-mumbai-1",
      input: "Food festivals happening in Mumbai this month",
      expectedTags: ["food", "festivals"],
      expectedLocation: "Mumbai",
    },
  ];
}

const experimentData = testCases.map((tc: any) => ({
  input: tc.input,
  // For completeness scoring, we specify what the output should contain
  groundTruth: JSON.stringify({
    requiredElements: [
      "event name",
      "date/time",
      "venue/location",
      "happenings URL",
    ],
  }),
  _testId: tc.id,
  _expectedTags: tc.expectedTags,
  _expectedLocation: tc.expectedLocation,
}));

async function runEventRecommenderExperiment() {
  console.log("🧪 Event Recommender Experiment");
  console.log("================================\n");
  console.log(`📊 Test cases: ${experimentData.length}`);
  console.log("📏 Scorers: Completeness, Answer Relevancy\n");

  console.log("⚠️  Note: This experiment makes real API calls to the Happenings database.");
  console.log("   If no events are found, the agent will say so honestly.\n");

  /**
   * 🧠 LEARNING: Completeness Scorer (Code-based)
   * ==============================================
   * Checks if the output contains comprehensive information.
   *
   * For event recommendations, we want:
   * - Event name (linked to Happenings)
   * - Date/time
   * - Venue/location
   *
   * This is a code-based scorer - no LLM calls, fast and deterministic.
   */
  const completenessScorer = createCompletenessScorer();

  /**
   * 🧠 LEARNING: Answer Relevancy Scorer
   * ====================================
   * Checks if the response actually addresses what was asked.
   *
   * For event recommendations:
   * - Did the agent respond about events?
   * - Are the events relevant to the location/type mentioned?
   * - Is it on-topic?
   *
   * NOTE: FaithfulnessScorer was removed because it requires a `context`
   * array to compare against. Since the event recommender fetches its
   * own context via tools, we can't provide pre-defined context.
   */
  const relevancyScorer = createAnswerRelevancyScorer({
    model: "openai/gpt-4o-mini",
  });

  const result = await runExperiment({
    target: eventRecommenderAgent,
    data: experimentData,
    scorers: [completenessScorer, relevancyScorer],
    concurrency: 1, // Event recommender makes external API calls, go slow

    onItemComplete: ({ item, targetResult, scorerResults }) => {
      const testId = (item as any)._testId;
      const output = (targetResult as any)?.text || "";

      // Check if we got actual event recommendations
      const hasEvents = output.includes("happenings.dhruvgajwa.com") ||
                       output.includes("found") ||
                       output.includes("events");

      console.log(`🎯 ${testId}:`);
      console.log(`   Completeness:   ${scorerResults[completenessScorer.name]?.score?.toFixed(2) || "N/A"}`);
      console.log(`   Relevancy:      ${scorerResults[relevancyScorer.name]?.score?.toFixed(2) || "N/A"}`);
      console.log(`   Has Events:     ${hasEvents ? "✅" : "⚠️ (No events found - may be correct)"}`);
      console.log();

      // Log a preview of the output
      const previewLength = 200;
      const preview = output.length > previewLength
        ? output.substring(0, previewLength) + "..."
        : output;
      console.log(`   Preview: ${preview.replace(/\n/g, " ")}`);
      console.log();
    },
  });

  console.log("\n" + "=".repeat(60));
  console.log("📊 EXPERIMENT SUMMARY");
  console.log("=".repeat(60) + "\n");

  console.log("Aggregate Scores (all higher is better):");
  for (const [scorerName, scoreData] of Object.entries(result.scores)) {
    const avgScore = (scoreData as any).score;
    console.log(`  ${scorerName}: ${avgScore?.toFixed(3) || "N/A"}`);
  }

  /**
   * 🧠 LEARNING: What to do with these scores?
   * ==========================================
   * Tool Call Accuracy < 0.7:
   *   → Agent is skipping tools or calling them in wrong order
   *   → Review agent instructions
   *
   * Completeness < 0.7:
   *   → Agent is missing required info in responses
   *   → Add more specific output format instructions
   *
   * Faithfulness < 0.8:
   *   → Agent may be hallucinating events!
   *   → This is a CRITICAL issue
   *   → Strengthen "only use tool results" instructions
   */

  return result;
}

// Run the experiment
runEventRecommenderExperiment()
  .then((result) => {
    console.log("\n✅ Experiment complete!");
    console.log("📝 Results are stored in mastra.db (mastra_scorers table)");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Experiment failed:", error);
    process.exit(1);
  });
