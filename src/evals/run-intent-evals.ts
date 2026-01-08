import { mastra } from "../mastra/index.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const intentTestCases = JSON.parse(
  readFileSync(join(__dirname, "./data/intent-classification-test-cases.json"), "utf-8")
);

/**
 * Intent Classification Evaluation Script
 *
 * Tests the intent classifier agent against a dataset of known high/low intent posts.
 * Measures:
 * - Classification accuracy (precision, recall, F1)
 * - Confidence score calibration
 * - False positive/negative rates
 * - Context extraction quality
 */

interface EvalResult {
  testCase: typeof intentTestCases[0];
  predicted: {
    intent: "high" | "low";
    confidence: number;
    context: any;
  };
  correct: boolean;
  confidenceDelta: number;
}

async function runIntentEvals() {
  console.log("🔍 Starting Intent Classification Evaluation...\n");
  console.log(`📊 Test cases: ${intentTestCases.length}\n`);

  const results: EvalResult[] = [];
  const agent = mastra.getAgent("intentClassifierAgent");

  for (const testCase of intentTestCases) {
    console.log(`Testing: ${testCase.id}`);
    console.log(`Input: "${testCase.input}"`);

    try {
      const result = await agent.generate(`Analyze this post:\n\n${testCase.input}`, {
        structuredOutput: {
          schema: z.object({
            intent: z.enum(["high", "low"]).describe("Classification result"),
            confidence: z.number().min(0).max(1).describe("Confidence score (0-1)"),
            reasoning: z.string().describe("Brief explanation of the classification"),
            context: z.object({
              location: z.string().optional().describe("Detected city or neighborhood"),
              vibe: z.string().optional().describe("Inferred mood or preference"),
              budget: z.string().optional().describe("Budget hints if mentioned"),
              timeframe: z.string().optional().describe("When they want to do something"),
            }),
          }),
        },
      });

      const classification = result.object;

      if (!classification) {
        console.log(`  ❌ No classification returned\n`);
        continue;
      }

      const correct = classification.intent === testCase.expectedIntent;
      const confidenceDelta = Math.abs(classification.confidence - testCase.expectedConfidence);

      results.push({
        testCase,
        predicted: {
          intent: classification.intent,
          confidence: classification.confidence,
          context: classification.context,
        },
        correct,
        confidenceDelta,
      });

      console.log(
        `  ${correct ? "✅" : "❌"} Predicted: ${classification.intent} (confidence: ${classification.confidence.toFixed(2)})`
      );
      console.log(`  Expected: ${testCase.expectedIntent} (confidence: ${testCase.expectedConfidence.toFixed(2)})`);
      console.log(`  Reasoning: ${classification.reasoning}\n`);
    } catch (err: any) {
      console.error(`  ❌ Error: ${err.message}\n`);
    }
  }

  // Calculate metrics
  const totalCases = results.length;
  const correctPredictions = results.filter((r) => r.correct).length;
  const accuracy = correctPredictions / totalCases;

  const highIntentCases = results.filter((r) => r.testCase.expectedIntent === "high");
  const lowIntentCases = results.filter((r) => r.testCase.expectedIntent === "low");

  const truePositives = highIntentCases.filter((r) => r.predicted.intent === "high").length;
  const falsePositives = lowIntentCases.filter((r) => r.predicted.intent === "high").length;
  const falseNegatives = highIntentCases.filter((r) => r.predicted.intent === "low").length;
  const trueNegatives = lowIntentCases.filter((r) => r.predicted.intent === "low").length;

  const precision = truePositives / (truePositives + falsePositives) || 0;
  const recall = truePositives / (truePositives + falseNegatives) || 0;
  const f1Score = (2 * precision * recall) / (precision + recall) || 0;

  const falsePositiveRate = falsePositives / lowIntentCases.length || 0;
  const falseNegativeRate = falseNegatives / highIntentCases.length || 0;

  const avgConfidenceDelta =
    results.reduce((sum, r) => sum + r.confidenceDelta, 0) / results.length;

  // Print summary
  console.log("\n" + "=".repeat(80));
  console.log("📊 EVALUATION SUMMARY");
  console.log("=".repeat(80) + "\n");

  console.log(`Total Test Cases: ${totalCases}`);
  console.log(`Correct Predictions: ${correctPredictions}/${totalCases}\n`);

  console.log("📈 Performance Metrics:");
  console.log(`  Accuracy: ${(accuracy * 100).toFixed(1)}%`);
  console.log(`  Precision: ${(precision * 100).toFixed(1)}%`);
  console.log(`  Recall: ${(recall * 100).toFixed(1)}%`);
  console.log(`  F1 Score: ${(f1Score * 100).toFixed(1)}%\n`);

  console.log("🎯 Classification Matrix:");
  console.log(`  True Positives: ${truePositives}`);
  console.log(`  False Positives: ${falsePositives} (${(falsePositiveRate * 100).toFixed(1)}% of low-intent)`);
  console.log(`  True Negatives: ${trueNegatives}`);
  console.log(`  False Negatives: ${falseNegatives} (${(falseNegativeRate * 100).toFixed(1)}% of high-intent)\n`);

  console.log("📊 Confidence Calibration:");
  console.log(`  Average Confidence Delta: ${(avgConfidenceDelta * 100).toFixed(1)}%\n`);

  // Goal check
  console.log("🎯 Goal Assessment:");
  if (falsePositiveRate <= 0.1) {
    console.log(`  ✅ False Positive Rate: ${(falsePositiveRate * 100).toFixed(1)}% (Target: <10%)`);
  } else {
    console.log(
      `  ❌ False Positive Rate: ${(falsePositiveRate * 100).toFixed(1)}% (Target: <10%) - NEEDS IMPROVEMENT`
    );
  }

  // Failed cases
  const failedCases = results.filter((r) => !r.correct);
  if (failedCases.length > 0) {
    console.log("\n" + "=".repeat(80));
    console.log("❌ FAILED TEST CASES");
    console.log("=".repeat(80) + "\n");

    failedCases.forEach((result) => {
      console.log(`ID: ${result.testCase.id}`);
      console.log(`Input: "${result.testCase.input}"`);
      console.log(
        `Expected: ${result.testCase.expectedIntent} | Predicted: ${result.predicted.intent}`
      );
      console.log(`Expected Reasoning: ${result.testCase.reasoning}`);
      console.log(`\n`);
    });
  }

  return {
    accuracy,
    precision,
    recall,
    f1Score,
    falsePositiveRate,
    falseNegativeRate,
    avgConfidenceDelta,
    results,
  };
}

// Run evaluations
runIntentEvals()
  .then((metrics) => {
    console.log("\n✅ Intent Classification Evaluation Complete!\n");
    process.exit(0);
  })
  .catch((err) => {
    console.error("\n❌ Evaluation failed:", err);
    process.exit(1);
  });
