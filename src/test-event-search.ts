import "dotenv/config";
import { geocodingTool } from "./mastra/tools/geocoding";
import { intentToTagsTool } from "./mastra/tools/intent-to-tags";
import { eventSearchTool } from "./mastra/tools/event-search";
import { eventRecommenderAgent } from "./mastra/agents/event-recommender";
import { RuntimeContext } from "@mastra/core/runtime-context";

/**
 * Test script for the enhanced event search tools
 *
 * Run with: npx tsx src/test-event-search.ts
 */

async function testTools() {
    console.log("🧪 Testing Enhanced Event Search Tools\n");
    console.log("=".repeat(60) + "\n");

    const runtimeContext = new RuntimeContext();

    // Test 1: Geocoding Tool
    console.log("📍 Test 1: Geocoding Tool");
    console.log("-".repeat(40));

    const geoResult = await geocodingTool.execute({
        context: { location: "Koramangala, Bangalore", country: "India" },
        runtimeContext,
    });

    console.log("Input: 'Koramangala, Bangalore'");
    console.log("Result:", JSON.stringify(geoResult, null, 2));
    console.log();

    // Test 2: Intent to Tags Tool
    console.log("🏷️  Test 2: Intent to Tags Tool");
    console.log("-".repeat(40));

    const testQueries = [
        "chill jazz night with friends",
        "weekend hiking trip near Bangalore",
        "startup networking event for entrepreneurs",
        "romantic dinner date spots",
        "fun things to do this weekend",
    ];

    for (const query of testQueries) {
        const tagsResult = await intentToTagsTool.execute({
            context: { query },
            runtimeContext,
        });

        console.log(`Query: "${query}"`);
        if (tagsResult.success && tagsResult.tags) {
            console.log(`  Categories: ${tagsResult.tags.primaryCategories.join(", ")}`);
            console.log(`  Interests: ${tagsResult.tags.interests.slice(0, 3).join(", ")}`);
            console.log(`  Confidence: ${(tagsResult.tags.confidence * 100).toFixed(0)}%`);
        }
        console.log();
    }

    // Test 3: Event Search Tool (Real API)
    console.log("🔍 Test 3: Event Search Tool (Live API)");
    console.log("-".repeat(40));

    const searchResult = await eventSearchTool.execute({
        context: {
            city: "Bangalore",
            tags: ["Music", "Entertainment"],
            radiusKm: 50,
            limit: 5,
            offset: 0,
            sortBy: "distance",
        },
        runtimeContext,
    });

    console.log("Search: Bangalore, tags=['Music', 'Entertainment'], radius=50km");
    console.log(`Found: ${searchResult.totalFound} events`);
    if (searchResult.success && searchResult.events.length > 0) {
        console.log("\nTop Events:");
        for (const event of searchResult.events.slice(0, 3)) {
            console.log(`  📅 ${event.name}`);
            console.log(`     Date: ${event.date}`);
            console.log(`     Venue: ${event.venue}`);
            console.log(`     Tags: ${event.tags.slice(0, 3).join(", ")}`);
            console.log(`     Price: ${event.price}`);
            console.log();
        }
    } else {
        console.log("No events found or API error:", searchResult.error);
    }
    console.log();

    // Test 4: Full Agent Test
    console.log("🤖 Test 4: Event Recommender Agent (Full Flow)");
    console.log("-".repeat(40));

    try {
        const agentQuery =
            "I'm looking for a fun jazz night or live music event in Bangalore this weekend. Something chill where I can hang out with friends.";

        console.log(`Query: "${agentQuery}"`);
        console.log("\nAgent thinking...\n");

        const result = await eventRecommenderAgent.generate(agentQuery);

        console.log("Agent Response:");
        console.log(result.text);
    } catch (error) {
        console.error("Agent error:", error);
    }

    console.log("\n" + "=".repeat(60));
    console.log("✅ All tests completed!");
}

testTools().catch(console.error);
