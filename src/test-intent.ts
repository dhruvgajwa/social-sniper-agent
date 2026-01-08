import "dotenv/config";
import { mastra } from "./mastra";
import { z } from "zod";

/**
 * Test the Intent Classifier Agent
 *
 * Run with: node dist/test-intent.js
 */
async function testIntentClassifier() {
  console.log("🧪 Testing Intent Classifier Agent\n");

  const agent = mastra.getAgent("intentClassifierAgent");

  const testPosts = [
    {
      text: "So bored on a Saturday night in Bangalore 😴 Anyone know what to do?",
      expected: "HIGH",
    },
    {
      text: "Just had the worst day at work. Boss is terrible.",
      expected: "LOW",
    },
    {
      text: "Looking for some fun activities this weekend in Mumbai. Any suggestions?",
      expected: "HIGH",
    },
    {
      text: "The weather is so nice today!",
      expected: "LOW",
    },
    {
      text: "Need ideas for tonight in Indiranagar. Preferably something chill and not too expensive.",
      expected: "HIGH",
    },
  ];

  for (const testPost of testPosts) {
    console.log(`\n📝 Post: "${testPost.text}"`);
    console.log(`   Expected: ${testPost.expected}`);

    const result = await agent.generate(`Analyze this post:\n\n${testPost.text}`, {
      structuredOutput: {
        schema: z.object({
          intent: z.enum(["high", "low"]),
          confidence: z.number(),
          reasoning: z.string(),
          context: z.object({
            location: z.string().optional(),
            vibe: z.string().optional(),
            budget: z.string().optional(),
            timeframe: z.string().optional(),
          }),
        }),
      },
    });

    const classification = result.object;

    if (!classification) {
      console.log("   ⚠️  No classification returned");
      continue;
    }

    console.log(`   Classified as: ${classification.intent.toUpperCase()}`);
    console.log(`   Confidence: ${classification.confidence.toFixed(2)}`);
    console.log(`   Reasoning: ${classification.reasoning}`);

    if (classification.context.location || classification.context.vibe) {
      console.log(`   Context:`);
      if (classification.context.location)
        console.log(`     - Location: ${classification.context.location}`);
      if (classification.context.vibe) console.log(`     - Vibe: ${classification.context.vibe}`);
      if (classification.context.timeframe)
        console.log(`     - Timeframe: ${classification.context.timeframe}`);
    }

    const correct = classification.intent.toUpperCase() === testPost.expected;
    console.log(`   ${correct ? "✅ CORRECT" : "❌ INCORRECT"}`);
  }
}

testIntentClassifier().catch(console.error);
