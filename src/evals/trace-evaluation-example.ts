/**
 * Example: Trace-Based Evaluation with Mastra Metrics
 * 
 * This demonstrates how to use @mastra/evals evaluate() function
 * for post-hoc analysis of agent outputs.
 * 
 * Note: The evaluate() function signature is:
 * evaluate(agent: Agent, input: string | object, metric: Metric)
 */

import { evaluate } from '@mastra/evals';
import { AnswerRelevancyMetric, ToxicityMetric } from '@mastra/evals/llm';
import { createOpenAI } from '@ai-sdk/openai';
import { intentClassifierAgent } from '../mastra/agents/intent-classifier';

async function runEvaluationExample() {
  console.log("🧪 Trace Evaluation Example\n");

  // 1. Prepare test input
  const testInput = "Looking for fun things to do in Bangalore this weekend";

  console.log("📥 Input:", testInput);
  console.log("\nRunning agent and evaluating...\n");

  // 2. Create OpenAI provider with legacy V2 compatibility
  const openaiProvider = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  // 3. Define metrics for evaluation (cast to any to bypass version mismatch)
  const answerRelevancyMetric = new AnswerRelevancyMetric(openaiProvider('gpt-4o-mini') as any);
  const toxicityMetric = new ToxicityMetric(openaiProvider('gpt-4o-mini') as any);

  // 4. Evaluate with Answer Relevancy metric
  console.log("⚡ Evaluating Answer Relevancy...");
  const relevancyResult = await evaluate(
    intentClassifierAgent,
    testInput,
    answerRelevancyMetric
  );

  console.log("📊 Answer Relevancy:");
  console.log(`  Score: ${relevancyResult.score}`);
  console.log(`  Output: ${relevancyResult.output}`);
  if (relevancyResult.info) {
    console.log(`  Info: ${JSON.stringify(relevancyResult.info, null, 2)}`);
  }
  console.log();

  // 5. Evaluate with Toxicity metric
  console.log("⚡ Evaluating Toxicity...");
  const toxicityResult = await evaluate(
    intentClassifierAgent,
    testInput,
    toxicityMetric
  );

  console.log("📊 Toxicity:");
  console.log(`  Score: ${toxicityResult.score}`);
  console.log(`  Output: ${toxicityResult.output}`);
  if (toxicityResult.info) {
    console.log(`  Info: ${JSON.stringify(toxicityResult.info, null, 2)}`);
  }
  console.log();
}

// Run if called directly
if (require.main === module) {
  runEvaluationExample()
    .then(() => {
      console.log("✅ Evaluation complete");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Evaluation failed:", error);
      process.exit(1);
    });
}

export { runEvaluationExample };
