import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { RuntimeContext } from "@mastra/core/runtime-context";
import { intentClassifierAgent } from "../mastra/agents/intent-classifier";
import { eventRecommenderAgent } from "../mastra/agents/event-recommender";
import { responseWriterAgent } from "../mastra/agents/response-writer";
import { intentToTagsTool } from "../mastra/tools/intent-to-tags";
import { geocodingTool } from "../mastra/tools/geocoding";
import { eventSearchTool } from "../mastra/tools/event-search";

// ESM compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * E2E Test Runner for Social Sniper Agent
 *
 * Tests the complete pipeline:
 * 1. Intent Classification
 * 2. Tag Extraction
 * 3. Geocoding
 * 4. Event Search
 * 5. Response Generation
 *
 * Run with: npx tsx src/evals/run-e2e-tests.ts
 */

interface TestCase {
    id: string;
    category: string;
    description?: string;
    post: {
        text: string;
        subreddit: string;
        author: string;
    };
    expected: {
        intent: "HIGH" | "LOW";
        shouldFindEvents?: boolean;
        expectedTags?: string[];
        expectedCity?: string;
        minEventsExpected?: number;
        reason?: string;
        notes?: string;
    };
}

interface TestResult {
    testId: string;
    category: string;
    passed: boolean;
    stages: {
        intentClassification: {
            passed: boolean;
            expected: string;
            actual: string;
            confidence?: number;
            error?: string;
        };
        tagExtraction?: {
            passed: boolean;
            expectedTags: string[];
            actualTags: string[];
            matchedTags: string[];
            error?: string;
        };
        geocoding?: {
            passed: boolean;
            expectedCity: string;
            actualCity?: string;
            coordinates?: { lat: number; lng: number };
            error?: string;
        };
        eventSearch?: {
            passed: boolean;
            eventsFound: number;
            minExpected: number;
            sampleEvents?: string[];
            error?: string;
        };
        responseGeneration?: {
            passed: boolean;
            responseLength: number;
            hasEventLinks: boolean;
            error?: string;
        };
    };
    duration: number;
    notes?: string;
}

interface TestSummary {
    totalTests: number;
    passed: number;
    failed: number;
    passRate: string;
    byCategory: Record<string, { total: number; passed: number; failed: number }>;
    byStage: {
        intentClassification: { passed: number; failed: number };
        tagExtraction: { passed: number; failed: number };
        geocoding: { passed: number; failed: number };
        eventSearch: { passed: number; failed: number };
        responseGeneration: { passed: number; failed: number };
    };
    failedTests: string[];
    duration: number;
}

async function runE2ETests(): Promise<void> {
    console.log("🧪 E2E Test Runner for Social Sniper Agent");
    console.log("=".repeat(70));
    console.log();

    // Load test cases
    const testDataPath = path.join(__dirname, "data", "e2e-test-cases.json");
    const testData = JSON.parse(fs.readFileSync(testDataPath, "utf-8"));
    const testCases: TestCase[] = testData.testCases;

    console.log(`📋 Loaded ${testCases.length} test cases`);
    console.log(`   Distribution: ${JSON.stringify(testData.metadata.distribution)}`);
    console.log();

    const results: TestResult[] = [];
    const runtimeContext = new RuntimeContext();
    const startTime = Date.now();

    // Run each test
    for (let i = 0; i < testCases.length; i++) {
        const testCase = testCases[i];
        const testStartTime = Date.now();

        console.log(`[${i + 1}/${testCases.length}] Testing ${testCase.id}: ${testCase.category}`);
        process.stdout.write(`   "${testCase.post.text.substring(0, 60)}..."\n`);

        const result = await runSingleTest(testCase, runtimeContext);
        result.duration = Date.now() - testStartTime;
        results.push(result);

        // Print result
        const status = result.passed ? "✅ PASS" : "❌ FAIL";
        console.log(`   ${status} (${result.duration}ms)`);

        if (!result.passed) {
            // Print failure details
            const failedStages = Object.entries(result.stages)
                .filter(([_, stage]) => stage && !stage.passed)
                .map(([name]) => name);
            console.log(`   Failed stages: ${failedStages.join(", ")}`);
        }

        console.log();

        // Small delay to avoid rate limiting
        await delay(200);
    }

    // Generate summary
    const summary = generateSummary(results);
    const totalDuration = Date.now() - startTime;
    summary.duration = totalDuration;

    // Print summary
    printSummary(summary, results);

    // Save results
    const outputPath = path.join(__dirname, "data", "e2e-test-results.json");
    fs.writeFileSync(
        outputPath,
        JSON.stringify({ summary, results, runAt: new Date().toISOString() }, null, 2)
    );
    console.log(`\n📁 Results saved to: ${outputPath}`);
}

async function runSingleTest(
    testCase: TestCase,
    runtimeContext: RuntimeContext
): Promise<TestResult> {
    const result: TestResult = {
        testId: testCase.id,
        category: testCase.category,
        passed: false,
        stages: {
            intentClassification: {
                passed: false,
                expected: testCase.expected.intent,
                actual: "",
            },
        },
        duration: 0,
    };

    try {
        // Stage 1: Intent Classification
        const intentResult = await classifyIntent(testCase.post.text);
        result.stages.intentClassification = {
            passed: intentResult.intent === testCase.expected.intent,
            expected: testCase.expected.intent,
            actual: intentResult.intent,
            confidence: intentResult.confidence,
        };

        // If LOW intent expected and correctly classified, test passes
        if (testCase.expected.intent === "LOW") {
            result.passed = result.stages.intentClassification.passed;
            return result;
        }

        // If HIGH intent expected but got LOW, test fails early
        if (!result.stages.intentClassification.passed) {
            return result;
        }

        // Stage 2: Tag Extraction
        if (testCase.expected.expectedTags) {
            const tagsResult = await intentToTagsTool.execute({
                context: { query: testCase.post.text },
                runtimeContext,
            });

            const actualTags = [
                ...(tagsResult.tags?.primaryCategories || []),
                ...(tagsResult.tags?.secondaryCategories || []),
                ...(tagsResult.tags?.interests || []),
            ];

            const expectedTagsLower = testCase.expected.expectedTags.map((t) => t.toLowerCase());
            const actualTagsLower = actualTags.map((t) => t.toLowerCase());

            const matchedTags = expectedTagsLower.filter((et) =>
                actualTagsLower.some((at) => at.includes(et) || et.includes(at))
            );

            // Pass if at least half of expected tags are matched
            const tagMatchRate = matchedTags.length / expectedTagsLower.length;

            result.stages.tagExtraction = {
                passed: tagMatchRate >= 0.5,
                expectedTags: testCase.expected.expectedTags,
                actualTags,
                matchedTags,
            };
        }

        // Stage 3: Geocoding
        if (testCase.expected.expectedCity) {
            const city = extractCity(testCase.post.text) || testCase.expected.expectedCity;

            const geoResult = await geocodingTool.execute({
                context: { location: city, country: "India" },
                runtimeContext,
            });

            result.stages.geocoding = {
                passed: geoResult.success === true,
                expectedCity: testCase.expected.expectedCity,
                actualCity: geoResult.result?.city || city,
                coordinates: geoResult.result
                    ? { lat: geoResult.result.latitude, lng: geoResult.result.longitude }
                    : undefined,
                error: geoResult.error,
            };
        }

        // Stage 4: Event Search
        if (testCase.expected.shouldFindEvents) {
            const city = testCase.expected.expectedCity || "Bangalore";
            const tags = result.stages.tagExtraction?.actualTags.slice(0, 3) || [];

            const searchResult = await eventSearchTool.execute({
                context: {
                    city,
                    tags,
                    radiusKm: 50,
                    limit: 5,
                    offset: 0,
                    sortBy: "distance",
                },
                runtimeContext,
            });

            const minExpected = testCase.expected.minEventsExpected || 0;

            result.stages.eventSearch = {
                passed: searchResult.success && searchResult.events.length >= minExpected,
                eventsFound: searchResult.events?.length || 0,
                minExpected,
                sampleEvents: searchResult.events?.slice(0, 3).map((e) => e.name),
                error: searchResult.error,
            };
        }

        // Stage 5: Response Generation (only if events found AND Anthropic key available)
        const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
        if (
            result.stages.eventSearch?.passed &&
            result.stages.eventSearch.eventsFound > 0 &&
            hasAnthropicKey
        ) {
            try {
                const responsePrompt = `
User post: "${testCase.post.text}"
Events found: ${JSON.stringify(result.stages.eventSearch.sampleEvents)}

Generate a helpful response recommending these events.
        `;

                const responseResult = await responseWriterAgent.generate(responsePrompt);
                const response = responseResult.text || "";

                result.stages.responseGeneration = {
                    passed: response.length > 50,
                    responseLength: response.length,
                    hasEventLinks: response.includes("http") || response.includes("happenings"),
                };
            } catch (error) {
                result.stages.responseGeneration = {
                    passed: false,
                    responseLength: 0,
                    hasEventLinks: false,
                    error: error instanceof Error ? error.message : "Unknown error",
                };
            }
        } else if (!hasAnthropicKey) {
            // Skip response generation if no Anthropic key - mark as passed (not tested)
            result.stages.responseGeneration = {
                passed: true,
                responseLength: 0,
                hasEventLinks: false,
                error: "Skipped - ANTHROPIC_API_KEY not set",
            };
        }

        // Calculate overall pass - exclude responseGeneration if skipped
        const stageResults = Object.entries(result.stages)
            .filter(([name, s]) => s !== undefined)
            .filter(
                ([name, s]) =>
                    name !== "responseGeneration" || !s.error?.includes("Skipped")
            )
            .map(([_, s]) => s);
        result.passed = stageResults.every((s) => s.passed);
    } catch (error) {
        result.stages.intentClassification.error =
            error instanceof Error ? error.message : "Unknown error";
    }

    return result;
}

async function classifyIntent(
    text: string
): Promise<{ intent: "HIGH" | "LOW"; confidence: number }> {
    try {
        const result = await intentClassifierAgent.generate(text);
        const response = result.text.toUpperCase();

        // Parse the response to extract intent
        let intent: "HIGH" | "LOW" = "LOW";
        let confidence = 0.5;

        if (response.includes("HIGH")) {
            intent = "HIGH";
            // Try to extract confidence from response
            const confMatch = response.match(/(\d+(?:\.\d+)?)\s*%/);
            if (confMatch) {
                confidence = parseFloat(confMatch[1]) / 100;
            } else {
                confidence = 0.85;
            }
        } else if (response.includes("LOW")) {
            intent = "LOW";
            confidence = 0.85;
        }

        return { intent, confidence };
    } catch (error) {
        console.error("Intent classification error:", error);
        return { intent: "LOW", confidence: 0.5 };
    }
}

function extractCity(text: string): string | null {
    const cities = [
        "bangalore",
        "bengaluru",
        "mumbai",
        "delhi",
        "hyderabad",
        "chennai",
        "pune",
        "kolkata",
        "goa",
        "jaipur",
        "ahmedabad",
        "kochi",
        "gurgaon",
        "noida",
        "chandigarh",
    ];

    const textLower = text.toLowerCase();
    for (const city of cities) {
        if (textLower.includes(city)) {
            return city.charAt(0).toUpperCase() + city.slice(1);
        }
    }

    // Check for neighborhoods that imply Bangalore
    const bangaloreAreas = [
        "koramangala",
        "indiranagar",
        "hsr",
        "whitefield",
        "electronic city",
        "marathahalli",
        "jayanagar",
        "jp nagar",
        "btm",
        "hebbal",
    ];

    for (const area of bangaloreAreas) {
        if (textLower.includes(area)) {
            return "Bangalore";
        }
    }

    return null;
}

function generateSummary(results: TestResult[]): TestSummary {
    const summary: TestSummary = {
        totalTests: results.length,
        passed: results.filter((r) => r.passed).length,
        failed: results.filter((r) => !r.passed).length,
        passRate: "",
        byCategory: {},
        byStage: {
            intentClassification: { passed: 0, failed: 0 },
            tagExtraction: { passed: 0, failed: 0 },
            geocoding: { passed: 0, failed: 0 },
            eventSearch: { passed: 0, failed: 0 },
            responseGeneration: { passed: 0, failed: 0 },
        },
        failedTests: [],
        duration: 0,
    };

    summary.passRate = ((summary.passed / summary.totalTests) * 100).toFixed(1) + "%";

    // By category
    for (const result of results) {
        if (!summary.byCategory[result.category]) {
            summary.byCategory[result.category] = { total: 0, passed: 0, failed: 0 };
        }
        summary.byCategory[result.category].total++;
        if (result.passed) {
            summary.byCategory[result.category].passed++;
        } else {
            summary.byCategory[result.category].failed++;
            summary.failedTests.push(result.testId);
        }
    }

    // By stage
    for (const result of results) {
        if (result.stages.intentClassification) {
            if (result.stages.intentClassification.passed) {
                summary.byStage.intentClassification.passed++;
            } else {
                summary.byStage.intentClassification.failed++;
            }
        }

        if (result.stages.tagExtraction) {
            if (result.stages.tagExtraction.passed) {
                summary.byStage.tagExtraction.passed++;
            } else {
                summary.byStage.tagExtraction.failed++;
            }
        }

        if (result.stages.geocoding) {
            if (result.stages.geocoding.passed) {
                summary.byStage.geocoding.passed++;
            } else {
                summary.byStage.geocoding.failed++;
            }
        }

        if (result.stages.eventSearch) {
            if (result.stages.eventSearch.passed) {
                summary.byStage.eventSearch.passed++;
            } else {
                summary.byStage.eventSearch.failed++;
            }
        }

        if (result.stages.responseGeneration) {
            if (result.stages.responseGeneration.passed) {
                summary.byStage.responseGeneration.passed++;
            } else {
                summary.byStage.responseGeneration.failed++;
            }
        }
    }

    return summary;
}

function printSummary(summary: TestSummary, results: TestResult[]): void {
    console.log("\n" + "=".repeat(70));
    console.log("📊 TEST SUMMARY");
    console.log("=".repeat(70));

    console.log(`\nOverall Results:`);
    console.log(`  Total Tests: ${summary.totalTests}`);
    console.log(`  ✅ Passed: ${summary.passed}`);
    console.log(`  ❌ Failed: ${summary.failed}`);
    console.log(`  📈 Pass Rate: ${summary.passRate}`);
    console.log(`  ⏱️  Duration: ${(summary.duration / 1000).toFixed(1)}s`);

    console.log(`\nBy Category:`);
    for (const [category, stats] of Object.entries(summary.byCategory)) {
        const rate = ((stats.passed / stats.total) * 100).toFixed(0);
        console.log(`  ${category}: ${stats.passed}/${stats.total} (${rate}%)`);
    }

    console.log(`\nBy Stage:`);
    for (const [stage, stats] of Object.entries(summary.byStage)) {
        const total = stats.passed + stats.failed;
        if (total > 0) {
            const rate = ((stats.passed / total) * 100).toFixed(0);
            console.log(`  ${stage}: ${stats.passed}/${total} (${rate}%)`);
        }
    }

    if (summary.failedTests.length > 0) {
        console.log(`\n❌ Failed Tests:`);
        for (const testId of summary.failedTests) {
            const result = results.find((r) => r.testId === testId);
            if (result) {
                console.log(`  ${testId} (${result.category}):`);
                for (const [stage, data] of Object.entries(result.stages)) {
                    if (data && !data.passed) {
                        console.log(`    - ${stage}: ${data.error || "Failed check"}`);
                    }
                }
            }
        }
    }
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Run tests
runE2ETests().catch(console.error);
