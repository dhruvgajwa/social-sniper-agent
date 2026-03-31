/**
 * Organizer Hunter — Standalone Runner
 *
 * Usage:
 *   npx tsx src/run-organizer-hunter.ts [URL1] [URL2] ...
 *
 * If no URLs are passed as arguments, the built-in example URLs are used.
 * Results are saved to ./organizers.db and printed as a table.
 *
 * Examples:
 *   npx tsx src/run-organizer-hunter.ts \
 *     https://www.eventbrite.com/e/some-event-123 \
 *     https://lu.ma/some-event \
 *     https://www.meetup.com/some-group/events/456
 */

import { scraperServiceTool } from "./mastra/tools/scraper.service";
import { OrganizerStore } from "./organizers/store";
import { RuntimeContext } from "@mastra/core/runtime-context";

// Default example URLs covering all supported platforms
const EXAMPLE_URLS = [
  "https://www.eventbrite.com/e/bangalore-tech-meetup-2025-123456789",
  "https://lu.ma/bangalore-startup-night",
  "https://www.meetup.com/bangalore-js/events/123456789",
  "https://allevents.in/bangalore/music-festival/12345",
  "https://www.boomyshow.com/events/bangalore-comedy-night",
];

async function main() {
  const urls = process.argv.slice(2).length > 0
    ? process.argv.slice(2)
    : EXAMPLE_URLS;

  console.log("\n🔍  Organizer Hunting Service");
  console.log(`📋  Scraping ${urls.length} URL(s)...\n`);

  const result = await scraperServiceTool.execute({
    context: {
      urls,
      dbUrl: "file:./organizers.db",
      timeoutMs: 15_000,
    },
    runtimeContext: new RuntimeContext(),
  });

  console.log("\n📊  Results:");
  console.log("─".repeat(90));

  for (const r of result.results) {
    if (r.error) {
      console.log(`❌  ${r.eventUrl}`);
      console.log(`    Error: ${r.error}`);
    } else {
      console.log(`✅  [${r.platform.toUpperCase()}] ${r.name}`);
      if (r.eventName) console.log(`    Event   : ${r.eventName}`);
      if (r.email)     console.log(`    Email   : ${r.email}`);
      if (r.website)   console.log(`    Website : ${r.website}`);
      if (r.socialLinks.length)
        console.log(`    Social  : ${r.socialLinks.map((s) => `${s.platform}→${s.url}`).join(", ")}`);
      console.log(`    Source  : ${r.eventUrl}`);
    }
    console.log();
  }

  console.log("─".repeat(90));
  console.log(`✅  Saved  : ${result.saved} organizers`);
  console.log(`❌  Failed : ${result.failed} URLs`);
  console.log(`🗄️   Total in DB : ${result.totalInDb} organizers`);
  console.log("\nDatabase: ./organizers.db\n");

  // Print a simple list from the database for verification
  if (result.saved > 0) {
    const store = new OrganizerStore("file:./organizers.db");
    await store.init();
    const all = await store.list();
    console.log(`\n📂  All organizers in database (${all.length}):`);
    for (const org of all) {
      const contact = [org.email, org.website].filter(Boolean).join(" | ");
      console.log(`  • ${org.name}  [${org.platform}]${contact ? "  →  " + contact : ""}`);
    }
    console.log();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
