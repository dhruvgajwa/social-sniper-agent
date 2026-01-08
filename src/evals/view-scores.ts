import { createClient } from "@libsql/client";

/**
 * Scorer Results Viewer Utility
 *
 * Queries the mastra_scorers table to view live evaluation results.
 * Provides insights into:
 * - Agent/workflow performance over time
 * - Score trends and distributions
 * - Scorer-specific metrics
 * - Recent evaluations
 */

interface ScorerRecord {
  id: string;
  runId: string;
  scorerName: string;
  score: number;
  reason?: string;
  timestamp: string;
  metadata?: any;
}

async function viewScores() {
  console.log("📊 Mastra Scorer Results Viewer\n");
  console.log("=".repeat(80) + "\n");

  // Initialize LibSQL client with the same configuration as Mastra
  const client = createClient({
    url: process.env.LIBSQL_URL || "file:./mastra.db",
    authToken: process.env.LIBSQL_AUTH_TOKEN,
  });

  try {
    // Check if mastra_scorers table exists
    const tablesResult = await client.execute({
      sql: "SELECT name FROM sqlite_master WHERE type='table' AND name='mastra_scorers'",
      args: [],
    });

    if (tablesResult.rows.length === 0) {
      console.log("⚠️  mastra_scorers table not found.");
      console.log("\nThe table will be created automatically when:");
      console.log("1. You run agents/workflows with scorers configured");
      console.log("2. The scorers execute and store results\n");
      console.log("💡 Try running the evaluation scripts first:\n");
      console.log("   npm run eval:intent");
      console.log("   npm run eval:response\n");
      return;
    }

    // Get total scorer records
    const countResult = await client.execute({
      sql: "SELECT COUNT(*) as count FROM mastra_scorers",
      args: [],
    });

    const totalRecords = (countResult.rows[0]?.count as number) || 0;
    console.log(`Total Scorer Records: ${totalRecords}\n`);

    if (totalRecords === 0) {
      console.log("📭 No scorer results found yet.\n");
      console.log("Scorers will start collecting data when you:");
      console.log("1. Run agents with scorers configured (live evaluation)");
      console.log("2. Execute evaluation scripts\n");
      return;
    }

    // Get recent scores
    console.log("📈 Recent Scores (Last 20):");
    console.log("-".repeat(80) + "\n");

    const recentScores = await client.execute({
      sql: `
        SELECT 
          id,
          runId,
          scorerName,
          score,
          reason,
          createdAt as timestamp,
          metadata
        FROM mastra_scorers 
        ORDER BY createdAt DESC 
        LIMIT 20
      `,
      args: [],
    });

    if (recentScores.rows.length === 0) {
      console.log("No recent scores found.\n");
    } else {
      recentScores.rows.forEach((row: any, idx) => {
        console.log(`${idx + 1}. ${row.scorerName}`);
        console.log(`   Score: ${typeof row.score === "number" ? row.score.toFixed(3) : row.score}`);
        console.log(`   Run ID: ${row.runId}`);
        console.log(`   Time: ${row.timestamp}`);
        if (row.reason) {
          const reasonPreview = row.reason.length > 100 ? row.reason.substring(0, 100) + "..." : row.reason;
          console.log(`   Reason: ${reasonPreview}`);
        }
        console.log("");
      });
    }

    // Get scorer statistics
    console.log("📊 Scorer Statistics:");
    console.log("-".repeat(80) + "\n");

    const scorerStats = await client.execute({
      sql: `
        SELECT 
          scorerName,
          COUNT(*) as executionCount,
          AVG(score) as avgScore,
          MIN(score) as minScore,
          MAX(score) as maxScore
        FROM mastra_scorers 
        GROUP BY scorerName
        ORDER BY executionCount DESC
      `,
      args: [],
    });

    if (scorerStats.rows.length === 0) {
      console.log("No scorer statistics available.\n");
    } else {
      scorerStats.rows.forEach((row: any) => {
        console.log(`${row.scorerName}:`);
        console.log(`  Executions: ${row.executionCount}`);
        console.log(`  Average Score: ${typeof row.avgScore === "number" ? row.avgScore.toFixed(3) : row.avgScore}`);
        console.log(
          `  Range: ${typeof row.minScore === "number" ? row.minScore.toFixed(3) : row.minScore} - ${typeof row.maxScore === "number" ? row.maxScore.toFixed(3) : row.maxScore}`
        );
        console.log("");
      });
    }

    // Get scores by agent
    console.log("🤖 Scores by Agent/Workflow:");
    console.log("-".repeat(80) + "\n");

    const agentScores = await client.execute({
      sql: `
        SELECT 
          json_extract(metadata, '$.agentName') as agentName,
          scorerName,
          AVG(score) as avgScore,
          COUNT(*) as count
        FROM mastra_scorers 
        WHERE json_extract(metadata, '$.agentName') IS NOT NULL
        GROUP BY json_extract(metadata, '$.agentName'), scorerName
        ORDER BY agentName, scorerName
      `,
      args: [],
    });

    if (agentScores.rows.length === 0) {
      console.log("No agent-specific scores available.\n");
    } else {
      let currentAgent = "";
      agentScores.rows.forEach((row: any) => {
        if (row.agentName !== currentAgent) {
          currentAgent = row.agentName;
          console.log(`\n${currentAgent}:`);
        }
        console.log(
          `  ${row.scorerName}: ${typeof row.avgScore === "number" ? row.avgScore.toFixed(3) : row.avgScore} (${row.count} runs)`
        );
      });
      console.log("");
    }

    console.log("\n" + "=".repeat(80));
    console.log("💡 Tips:");
    console.log("=".repeat(80) + "\n");
    console.log("- Run evaluation scripts regularly to track performance trends");
    console.log("- Monitor average scores to catch degradation early");
    console.log("- Review low scores to identify improvement areas");
    console.log("- Use sampling (rate: 0.2) to balance monitoring vs. cost\n");
  } catch (err: any) {
    console.error("❌ Error querying scorer results:", err.message);
    console.error("\nTroubleshooting:");
    console.error("1. Ensure LIBSQL_URL is set in .env (default: file:./mastra.db)");
    console.error("2. Run evaluation scripts to populate scorer data");
    console.error("3. Check database permissions and file access\n");
  } finally {
    client.close();
  }
}

// Run viewer
viewScores()
  .then(() => {
    console.log("✅ Scorer results review complete!\n");
    process.exit(0);
  })
  .catch((err) => {
    console.error("\n❌ Viewer failed:", err);
    process.exit(1);
  });
