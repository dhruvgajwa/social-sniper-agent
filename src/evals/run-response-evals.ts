import { mastra } from "../mastra/index.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const responseTestCases = JSON.parse(
  readFileSync(join(__dirname, "./data/response-quality-test-cases.json"), "utf-8")
);

/**
 * Response Quality Evaluation Script
 *
 * Tests the response writer agent against sample posts and event recommendations.
 * Measures:
 * - Tone consistency (casual, empathetic, local)
 * - Prompt alignment (structure, length, signature)
 * - Content quality (event integration, natural flow)
 * - Safety (toxicity, bias)
 */

interface EvalResult {
  testCase: typeof responseTestCases[0];
  response: string;
  scores: {
    toneConsistency: number | null;
    promptAlignment: number | null;
    toxicity: number | null;
    bias: number | null;
  };
}

async function runResponseEvals() {
  console.log("✍️ Starting Response Quality Evaluation...\n");
  console.log(`📊 Test cases: ${responseTestCases.length}\n`);

  const results: EvalResult[] = [];
  const agent = mastra.getAgent("responseWriterAgent");

  for (const testCase of responseTestCases) {
    console.log(`Testing: ${testCase.id}`);
    console.log(`Post: "${testCase.post.text}"`);

    const prompt = `
Original Post:
${testCase.post.text}

Detected Context:
- Location: ${testCase.post.context?.location || "not specified"}
- Vibe: ${testCase.post.context?.vibe || "not specified"}
- Timeframe: ${testCase.post.context?.timeframe || "not specified"}

Event Recommendations:
${testCase.eventRecommendations || "No events found"}

Write a response following the tone and structure guidelines.
    `.trim();

    try {
      const result = await agent.generate(prompt);

      const response = result.text || "";

      console.log(`\n📝 Generated Response:\n${response}\n`);

      // For now, we'll just collect the responses
      // Actual scoring happens via live scorers configured on the agent
      results.push({
        testCase,
        response,
        scores: {
          toneConsistency: null, // Will be populated by live scorers
          promptAlignment: null,
          toxicity: null,
          bias: null,
        },
      });

      console.log("✅ Response generated successfully\n");
      console.log("-".repeat(80) + "\n");
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}\n`);
    }
  }

  // Manual quality assessment
  console.log("\n" + "=".repeat(80));
  console.log("📊 MANUAL QUALITY ASSESSMENT");
  console.log("=".repeat(80) + "\n");

  console.log("Please review the generated responses above and assess:");
  console.log("1. ✅ Tone: Casual, empathetic, 'bhai/bro' vibe where appropriate");
  console.log("2. ✅ Structure: 2-3 sentences with empathy → solution → link → signature");
  console.log("3. ✅ Natural: Sounds like a real person, not a marketing bot");
  console.log("4. ✅ Safety: No toxic or biased content");
  console.log("5. ✅ Event Integration: Naturally incorporates recommendations\n");

  console.log("📊 Expected Quality Metrics:");
  responseTestCases.forEach((tc: typeof responseTestCases[0]) => {
    console.log(`\n${tc.id}:`);
    console.log(`  Tone Alignment: ${(tc.qualityMetrics.toneAlignment * 100).toFixed(0)}%`);
    console.log(`  Prompt Following: ${(tc.qualityMetrics.promptFollowing * 100).toFixed(0)}%`);
    console.log(`  Toxicity: ${tc.qualityMetrics.toxicity}`);
    console.log(`  Bias: ${tc.qualityMetrics.bias}`);
  });

  console.log("\n" + "=".repeat(80));
  console.log("💡 NOTE: Live scorers are active on the agent");
  console.log("=".repeat(80));
  console.log("\nScorer results will be stored in the mastra_scorers table.");
  console.log("Use the view-scores.ts utility to analyze historical scoring data.\n");

  return results;
}

// Run evaluations
runResponseEvals()
  .then((results) => {
    console.log("\n✅ Response Quality Evaluation Complete!\n");
    console.log(`Generated ${results.length} responses for manual review.\n`);
    process.exit(0);
  })
  .catch((err) => {
    console.error("\n❌ Evaluation failed:", err);
    process.exit(1);
  });
