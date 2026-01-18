/**
 * Intent Classifier Experiment
 *
 * This script uses Mastra's `runExperiment()` function to evaluate
 * the intent classification agent using multiple built-in scorers.
 *
 * 🧠 LEARNING: What is an "Experiment" in Mastra?
 * ================================================
 * An experiment is a batch evaluation that:
 * 1. Takes a TARGET (your agent or workflow)
 * 2. Runs it against multiple DATA items (test cases)
 * 3. Scores each output using SCORERS (evaluation functions)
 * 4. Returns aggregated results
 *
 * Unlike manual testing where you check outputs yourself,
 * experiments give you quantifiable metrics you can track over time.
 *
 * 🎯 SCORERS USED:
 * ----------------
 * 1. Answer Similarity - Compares agent output to expected "ground truth"
 *    Perfect for intent classification where we KNOW the right answer.
 *
 * 2. Answer Relevancy - Does the response actually address the input?
 *    Catches cases where the agent goes off-topic.
 *
 * 📊 RESULTS:
 * -----------
 * After running, you'll see:
 * - Per-item scores for each test case
 * - Aggregate scores across all test cases
 * - Detailed reasoning for each score
 *
 * Run with: npx tsx src/evals/experiments/intent-classifier-experiment.ts
 */

import "dotenv/config";
import { runExperiment } from "@mastra/core/scores";
import {
  createAnswerSimilarityScorer,
  createAnswerRelevancyScorer,
} from "@mastra/evals/scorers/llm";
import { intentClassifierAgent } from "../../mastra/agents/intent-classifier";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Get directory path for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load test cases
const testCases = JSON.parse(
  readFileSync(join(__dirname, "../data/intent-classification-test-cases.json"), "utf-8")
);

/**
 * Transform our test cases into the format runExperiment expects.
 *
 * 🧠 LEARNING: Data Format
 * ========================
 * Each item in the `data` array needs:
 * - `input`: What to send to the agent (string or message array)
 * - `groundTruth` (optional): The expected/correct answer for comparison
 *
 * The groundTruth is used by scorers like `AnswerSimilarity` to compare
 * the agent's output against what we know is correct.
 */
const experimentData = testCases.map((tc: any) => ({
  input: `Analyze this post:\n\n${tc.input}`,
  groundTruth: JSON.stringify({
    intent: tc.expectedIntent,
    confidence: tc.expectedConfidence,
    reasoning: tc.reasoning,
  }),
  // Custom metadata for our analysis
  _testId: tc.id,
  _expectedIntent: tc.expectedIntent,
}));

async function runIntentClassifierExperiment() {
  console.log("🧪 Intent Classifier Experiment");
  console.log("================================\n");
  console.log(`📊 Test cases: ${experimentData.length}`);
  console.log("📏 Scorers: Answer Similarity, Answer Relevancy\n");

  /**
   * 🧠 LEARNING: Creating Scorers
   * =============================
   * Mastra uses factory functions to create scorers.
   * Each scorer needs a language model to do its evaluation.
   *
   * The model evaluates the output and produces a score (0-1).
   * This is called "LLM-as-judge" - using an AI to judge AI outputs.
   */
  const answerSimilarityScorer = createAnswerSimilarityScorer({
    model: "openai/gpt-4o-mini",
  });

  const answerRelevancyScorer = createAnswerRelevancyScorer({
    model: "openai/gpt-4o-mini",
  });

  /**
   * 🧠 LEARNING: Running the Experiment
   * ===================================
   * runExperiment() does the following:
   * 1. Iterates through each item in `data`
   * 2. Calls the target agent with `item.input`
   * 3. Runs all scorers on the agent's output
   * 4. Aggregates results
   *
   * The `onItemComplete` callback fires after each test case,
   * letting us log progress in real-time.
   */
  const result = await runExperiment({
    target: intentClassifierAgent,
    data: experimentData,
    scorers: [answerSimilarityScorer, answerRelevancyScorer],
    concurrency: 2, // Run 2 test cases in parallel for speed

    onItemComplete: ({ item, targetResult, scorerResults }) => {
      // Extract our custom metadata
      const testId = (item as any)._testId;
      const expectedIntent = (item as any)._expectedIntent;

      // Get the agent's predicted intent from the output
      // targetResult is the resolved result from the agent
      const output = (targetResult as any)?.text || "";
      let predictedIntent = "unknown";
      try {
        const parsed = JSON.parse(output);
        predictedIntent = parsed.intent || "unknown";
      } catch {
        // Output wasn't JSON, try to extract intent
        if (output.toLowerCase().includes('"intent": "high"')) {
          predictedIntent = "high";
        } else if (output.toLowerCase().includes('"intent": "low"')) {
          predictedIntent = "low";
        }
      }

      const correct = predictedIntent === expectedIntent;
      const emoji = correct ? "✅" : "❌";

      console.log(`${emoji} ${testId}: ${expectedIntent} → ${predictedIntent}`);
      console.log(`   Similarity: ${scorerResults[answerSimilarityScorer.name]?.score?.toFixed(2) || "N/A"}`);
      console.log(`   Relevancy:  ${scorerResults[answerRelevancyScorer.name]?.score?.toFixed(2) || "N/A"}`);
      console.log();
    },
  });

  /**
   * 🧠 LEARNING: Interpreting Results
   * =================================
   * The experiment result contains:
   * - `scores`: Aggregate scores for each scorer (averaged across all items)
   * - `summary`: Metadata about the run (total items, timing, etc.)
   * - `items`: Detailed results for each test case
   *
   * These scores are also automatically stored in the `mastra_scorers`
   * table if you have storage configured (which we do!).
   */
  console.log("\n" + "=".repeat(60));
  console.log("📊 EXPERIMENT SUMMARY");
  console.log("=".repeat(60) + "\n");

  console.log("Aggregate Scores (averaged across all test cases):");
  for (const [scorerName, scoreData] of Object.entries(result.scores)) {
    const avgScore = (scoreData as any).score;
    console.log(`  ${scorerName}: ${avgScore?.toFixed(3) || "N/A"}`);
  }

  console.log(`\nTotal items: ${result.summary.totalItems}`);

  /**
   * 🧠 LEARNING: What do these scores mean?
   * =======================================
   * Answer Similarity (0-1):
   * - 1.0: Output exactly matches expected ground truth
   * - 0.7-0.9: Semantically similar, minor differences
   * - 0.4-0.6: Partially correct
   * - 0.0-0.3: Very different from expected
   *
   * Answer Relevancy (0-1):
   * - 1.0: Response fully addresses the input query
   * - 0.7-0.9: Mostly relevant with minor tangents
   * - 0.4-0.6: Partially relevant
   * - 0.0-0.3: Off-topic or irrelevant
   */

  return result;
}

// Run the experiment
runIntentClassifierExperiment()
  .then((result) => {
    console.log("\n✅ Experiment complete!");
    console.log("📝 Results are stored in mastra.db (mastra_scorers table)");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Experiment failed:", error);
    process.exit(1);
  });
