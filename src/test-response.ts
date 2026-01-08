import "dotenv/config";
import { mastra } from "./mastra";

/**
 * Test the complete response generation flow
 *
 * Run with: node dist/test-response.js
 */
async function testResponseGeneration() {
  console.log("🧪 Testing Response Generation Flow\n");

  const eventAgent = mastra.getAgent("eventRecommenderAgent");
  const responseAgent = mastra.getAgent("responseWriterAgent");

  const testScenario = {
    post: "So bored this weekend in Bangalore. Looking for something fun and not too expensive in Indiranagar area.",
    context: {
      location: "Indiranagar, Bangalore",
      vibe: "fun, casual",
      budget: "affordable",
      timeframe: "this weekend",
    },
  };

  console.log(`📝 Original Post:\n   "${testScenario.post}"\n`);

  // Step 1: Find events
  console.log("🔍 Step 1: Finding matching events...");
  const eventQuery = `
User post: ${testScenario.post}

Context:
- Location: ${testScenario.context.location}
- Vibe: ${testScenario.context.vibe}
- Budget: ${testScenario.context.budget}
- Timeframe: ${testScenario.context.timeframe}

Find the best matching events.
  `.trim();

  const eventResult = await eventAgent.generate(eventQuery);
  console.log(`\n   Event Recommendations:\n   ${eventResult.text}\n`);

  // Step 2: Generate response
  console.log("✍️  Step 2: Generating response...");
  const responsePrompt = `
Original Post:
${testScenario.post}

Detected Context:
- Location: ${testScenario.context.location}
- Vibe: ${testScenario.context.vibe}
- Budget: ${testScenario.context.budget}
- Timeframe: ${testScenario.context.timeframe}

Event Recommendations:
${eventResult.text}

Write a response following the tone and structure guidelines.
  `.trim();

  const responseResult = await responseAgent.generate(responsePrompt);

  console.log(`\n   Generated Response:\n`);
  console.log(`   ${responseResult.text}\n`);

  console.log("✅ Test completed!");
}

testResponseGeneration().catch(console.error);
