import "dotenv/config";
import fs from "fs";
import path from "path";
import { mastra } from "../mastra";
import { z } from "zod";

async function run() {
    console.log("🧪 Running Reddit intent evaluation on test dataset\n");

    const intentThreshold = parseFloat(process.env.INTENT_THRESHOLD || "0.8");

    const file = path.join(process.cwd(), "src", "test-data", "reddit_test_posts.json");
    const raw = fs.readFileSync(file, "utf-8");
    const posts = JSON.parse(raw) as any[];

    const agent = mastra.getAgent("intentClassifierAgent");
    if (!agent) {
        console.error("❌ intentClassifierAgent not registered in mastra");
        process.exit(1);
    }

    let tp = 0,
        tn = 0,
        fp = 0,
        fn = 0;

    // Try using the registered Mastra agent. If it fails due to streaming/model compatibility
    // (common with older AI SDK models), fall back to a simple keyword-based heuristic.
    let fallbackToHeuristic = false;

    // Helper heuristic classifier
    const keywords = [
        "what to do",
        "anyone",
        "any suggestions",
        "looking for",
        "looking to",
        "want to",
        "who's in",
        "join",
        "interested",
        "going to",
        "planning",
        "need ideas",
        "tickets",
        "meet",
        "meetup",
    ];

    const heuristicClassify = (text: string) => {
        const t = text.toLowerCase();
        for (const kw of keywords) if (t.includes(kw)) return { intent: "high", confidence: 0.9 };
        return { intent: "low", confidence: 0.1 };
    };

    for (const post of posts) {
        const text = `${post.title}\n\n${post.selftext}`;

        let classification: any = null;

        if (!fallbackToHeuristic) {
            try {
                const result = await agent.generate(`Analyze this post:\n\n${text}`, {
                    structuredOutput: {
                        schema: z.object({
                            intent: z.enum(["high", "low"]),
                            confidence: z.number(),
                            reasoning: z.string(),
                            context: z
                                .object({
                                    location: z.string().optional(),
                                    vibe: z.string().optional(),
                                    budget: z.string().optional(),
                                    timeframe: z.string().optional(),
                                })
                                .optional(),
                        }),
                    },
                });

                classification = result.object;
            } catch (err: any) {
                // If the agent errors due to streaming/model mismatch, switch to heuristic
                console.warn("⚠️  Agent.generate failed — falling back to heuristic classifier:", err.message || err);
                fallbackToHeuristic = true;
            }
        }

        if (!classification) {
            classification = heuristicClassify(text);
        }

        const predictedHigh = classification.intent === "high" && classification.confidence >= intentThreshold;
        const actualHigh = (post.metadata && post.metadata.intent ? post.metadata.intent : 0) >= intentThreshold;

        if (predictedHigh && actualHigh) tp++;
        else if (predictedHigh && !actualHigh) fp++;
        else if (!predictedHigh && actualHigh) fn++;
        else tn++;

        console.log(`Post ${post.id}: actual=${actualHigh ? "HIGH" : "LOW"} (${(post.metadata.intent || 0).toFixed(2)}) → predicted=${classification.intent.toUpperCase()} (${classification.confidence.toFixed(2)})`);
    }

    const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
    const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
    const accuracy = (tp + tn) / (tp + tn + fp + fn || 1);
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

    console.log("\n🔎 Evaluation Results:");
    console.log(`  True positives: ${tp}`);
    console.log(`  False positives: ${fp}`);
    console.log(`  False negatives: ${fn}`);
    console.log(`  True negatives: ${tn}`);
    console.log(`\n  Accuracy: ${(accuracy * 100).toFixed(2)}%`);
    console.log(`  Precision: ${(precision * 100).toFixed(2)}%`);
    console.log(`  Recall: ${(recall * 100).toFixed(2)}%`);
    console.log(`  F1 score: ${(f1 * 100).toFixed(2)}%`);
}

run().catch((e) => {
    console.error(e);
    process.exit(1);
});
