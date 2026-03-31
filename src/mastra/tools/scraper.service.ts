/**
 * Organizer Scraper Service
 *
 * A Mastra tool that accepts event page URLs from supported platforms
 * (Eventbrite, Meetup, Luma, Allevents, Boomyshow) and extracts structured
 * organizer details from each page.  Extracted records are persisted in the
 * local organizers database and returned for downstream use.
 *
 * Extraction strategy (in order of preference):
 *  1. JSON-LD structured data (<script type="application/ld+json">)
 *  2. OpenGraph / meta tags
 *  3. Platform-specific HTML pattern matching
 *
 * No external HTML-parsing library is required — only the built-in fetch API
 * and lightweight regex is used, keeping the dependency footprint minimal.
 */

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { OrganizerStore, type OrganizerRecord, type OrganizerPlatform, type SocialLink } from "../../organizers/store";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Extract the first regex match or return undefined */
function firstMatch(html: string, pattern: RegExp): string | undefined {
  return pattern.exec(html)?.[1]?.trim() || undefined;
}

/** Decode common HTML entities */
function decodeEntities(text: string): string {
  // Replace named/numeric entities first, &amp; last to prevent double-unescaping
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Extract all e-mail addresses found in a block of text */
function extractEmails(text: string): string[] {
  const re = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const found = text.match(re) ?? [];
  // Filter out common false positives (image filenames, tracking IDs, etc.)
  return [...new Set(found)].filter(
    (e) => !e.includes(".png") && !e.includes(".jpg") && !e.includes(".gif")
  );
}

/** Extract known social-media profile links */
function extractSocialLinks(html: string): SocialLink[] {
  const patterns: Array<{ platform: string; re: RegExp }> = [
    { platform: "twitter",   re: /https?:\/\/(?:www\.)?(?:twitter|x)\.com\/([A-Za-z0-9_]{1,50})/g },
    { platform: "instagram", re: /https?:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9_.]{1,50})/g },
    { platform: "facebook",  re: /https?:\/\/(?:www\.)?facebook\.com\/([A-Za-z0-9_.]{1,100})/g },
    { platform: "linkedin",  re: /https?:\/\/(?:www\.)?linkedin\.com\/(?:in|company)\/([A-Za-z0-9_\-]{1,100})/g },
    { platform: "youtube",   re: /https?:\/\/(?:www\.)?youtube\.com\/(?:c\/|channel\/|@)([A-Za-z0-9_\-]{1,100})/g },
  ];

  const links: SocialLink[] = [];
  const seen = new Set<string>();

  for (const { platform, re } of patterns) {
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(html)) !== null) {
      const url = m[0];
      if (!seen.has(url)) {
        seen.add(url);
        links.push({ platform, url });
      }
    }
  }

  return links;
}

/** Parse all JSON-LD blocks and return the first that has a useful type */
function parseJsonLd(html: string): any | null {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;

  while ((m = re.exec(html)) !== null) {
    try {
      const data = JSON.parse(m[1]);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item["@type"] && ["Event", "SocialEvent", "MusicEvent", "TheaterEvent", "Organization"].includes(item["@type"])) {
          return item;
        }
      }
    } catch {
      // malformed JSON-LD — skip
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

function detectPlatform(url: string): OrganizerPlatform {
  if (/eventbrite\.com/i.test(url)) return "eventbrite";
  if (/meetup\.com/i.test(url)) return "meetup";
  if (/lu\.ma/i.test(url)) return "luma";
  if (/allevents\.in/i.test(url)) return "allevents";
  if (/boomyshow\.com/i.test(url)) return "boomyshow";
  return "unknown";
}

// ---------------------------------------------------------------------------
// Platform-specific extractors
// ---------------------------------------------------------------------------

interface ExtractedOrganizer {
  name?: string;
  email?: string;
  website?: string;
  phone?: string;
  description?: string;
  eventName?: string;
  socialLinks: SocialLink[];
}

function extractFromJsonLd(html: string): Partial<ExtractedOrganizer> {
  const ld = parseJsonLd(html);
  if (!ld) return {};

  const organizer = ld.organizer ?? ld.performer ?? null;
  const name =
    (typeof organizer === "object" ? organizer?.name : undefined) ??
    ld.organizer?.name ??
    undefined;

  const website =
    (typeof organizer === "object" ? organizer?.url : undefined) ??
    ld.url ??
    undefined;

  const email =
    (typeof organizer === "object" ? organizer?.email : undefined) ??
    undefined;

  const description =
    (typeof organizer === "object" ? organizer?.description : undefined) ??
    ld.description?.slice(0, 400) ??
    undefined;

  return {
    name: name ? decodeEntities(String(name)) : undefined,
    email: email ? String(email) : undefined,
    website: website ? String(website) : undefined,
    description: description ? decodeEntities(String(description)) : undefined,
    eventName: ld.name ? decodeEntities(String(ld.name)) : undefined,
  };
}

function extractEventbrite(html: string): Partial<ExtractedOrganizer> {
  const result: Partial<ExtractedOrganizer> = {};

  // Organizer name appears in multiple places — try structured then fallback
  result.name =
    firstMatch(html, /"organizer"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/) ??
    firstMatch(html, /class="[^"]*descriptive-organizer-info__name[^"]*"[^>]*>\s*([^<]{2,80})</) ??
    firstMatch(html, /"organizer_name"\s*:\s*"([^"]+)"/);

  result.website =
    firstMatch(html, /"organizer"\s*:\s*\{[^}]*"url"\s*:\s*"([^"]+)"/) ??
    firstMatch(html, /href="(https?:\/\/[^"]+organizer[^"]+)"/);

  result.eventName =
    firstMatch(html, /<h1[^>]*class="[^"]*event-title[^"]*"[^>]*>\s*([^<]{2,200})</) ??
    firstMatch(html, /<title>([^<]{2,200})<\/title>/);

  return result;
}

function extractMeetup(html: string): Partial<ExtractedOrganizer> {
  const result: Partial<ExtractedOrganizer> = {};

  // Group/organizer info
  result.name =
    firstMatch(html, /"organizerName"\s*:\s*"([^"]+)"/) ??
    firstMatch(html, /"groupName"\s*:\s*"([^"]+)"/) ??
    firstMatch(html, /class="[^"]*groupName[^"]*"[^>]*>\s*([^<]{2,100})</);

  result.website =
    firstMatch(html, /"groupUrl"\s*:\s*"([^"]+)"/) ??
    firstMatch(html, /"organizerUrl"\s*:\s*"([^"]+)"/);

  result.description =
    firstMatch(html, /"groupDescription"\s*:\s*"([^"]{10,400})"/) ??
    firstMatch(html, /"groupAbout"\s*:\s*"([^"]{10,400})"/);

  result.eventName =
    firstMatch(html, /"eventName"\s*:\s*"([^"]+)"/) ??
    firstMatch(html, /<h1[^>]*>\s*([^<]{2,200})<\/h1>/);

  return result;
}

function extractLuma(html: string): Partial<ExtractedOrganizer> {
  const result: Partial<ExtractedOrganizer> = {};

  // Luma embeds host info in a __NEXT_DATA__ JSON blob
  const nextData = firstMatch(html, /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (nextData) {
    try {
      const data = JSON.parse(nextData);
      const event =
        data?.props?.pageProps?.event ??
        data?.props?.pageProps?.initialData?.event ??
        null;

      if (event) {
        const host = event.hosts?.[0] ?? event.host ?? null;
        result.name = host?.name ?? event.organizer_name ?? undefined;
        result.website = host?.url ?? undefined;
        result.description = host?.bio ?? undefined;
        result.eventName = event.name ?? undefined;
      }
    } catch {
      // malformed JSON — fall through to regex
    }
  }

  if (!result.name) {
    result.name =
      firstMatch(html, /"hostName"\s*:\s*"([^"]+)"/) ??
      firstMatch(html, /class="[^"]*host-name[^"]*"[^>]*>\s*([^<]{2,100})</);
  }

  if (!result.eventName) {
    result.eventName = firstMatch(html, /<title>([^|<]{2,200})[\s|]/);
  }

  return result;
}

function extractAllevents(html: string): Partial<ExtractedOrganizer> {
  const result: Partial<ExtractedOrganizer> = {};

  result.name =
    firstMatch(html, /class="[^"]*organizer[^"]*"[^>]*>\s*<[^>]+>\s*([^<]{2,100})</) ??
    firstMatch(html, /"organizer"\s*:\s*"([^"]+)"/) ??
    firstMatch(html, /Organizer[^:]*:\s*<[^>]+>\s*([^<]{2,100})</i);

  result.eventName = firstMatch(html, /<h1[^>]*>\s*([^<]{2,200})<\/h1>/);

  result.website = firstMatch(html, /href="(https?:\/\/(?!allevents)[^"]{5,})"[^>]*>\s*(?:Website|Official|Visit)/i);

  return result;
}

function extractBoomyshow(html: string): Partial<ExtractedOrganizer> {
  const result: Partial<ExtractedOrganizer> = {};

  result.name =
    firstMatch(html, /class="[^"]*organizer[^"]*"[^>]*>\s*([^<]{2,100})</) ??
    firstMatch(html, /"organizer"\s*:\s*"([^"]+)"/);

  result.eventName = firstMatch(html, /<h1[^>]*>\s*([^<]{2,200})<\/h1>/);

  return result;
}

function extractGeneric(html: string): Partial<ExtractedOrganizer> {
  return {
    name:
      firstMatch(html, /[Oo]rganized [Bb]y[^>]*[>:]\s*([A-Za-z0-9 &.,'-]{2,80})/) ??
      firstMatch(html, /[Hh]osted [Bb]y[^>]*[>:]\s*([A-Za-z0-9 &.,'-]{2,80})/) ??
      firstMatch(html, /<meta[^>]+property="og:site_name"[^>]+content="([^"]+)"/),
    eventName: firstMatch(html, /<meta[^>]+property="og:title"[^>]+content="([^"]+)"/),
    website: firstMatch(html, /<meta[^>]+property="og:url"[^>]+content="([^"]+)"/),
    description: firstMatch(html, /<meta[^>]+property="og:description"[^>]+content="([^"]{10,400})"/),
  };
}

// ---------------------------------------------------------------------------
// Main per-URL scrape function
// ---------------------------------------------------------------------------

async function scrapeOrganizerFromUrl(
  url: string,
  timeoutMs = 15_000
): Promise<Omit<OrganizerRecord, "id" | "scrapedAt" | "contactStatus">> {
  const platform = detectPlatform(url);

  let html: string;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; HappeningsOrganizerBot/1.0; +https://happenings.dhruvgajwa.com)",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    clearTimeout(timer);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    html = await response.text();
  } catch (err: any) {
    throw new Error(`Failed to fetch ${url}: ${err.message}`);
  }

  // Extract from JSON-LD first (most reliable), then platform-specific, then generic
  const ldData = extractFromJsonLd(html);
  const platformExtractor = PLATFORM_EXTRACTORS[platform] ?? extractGeneric;
  const platformData = platformExtractor(html);

  const genericData = extractGeneric(html);

  // Merge: JSON-LD has priority, then platform-specific, then generic
  const merged: ExtractedOrganizer = {
    name:        ldData.name        ?? platformData.name        ?? genericData.name,
    email:       ldData.email       ?? platformData.email       ?? genericData.email,
    website:     ldData.website     ?? platformData.website     ?? genericData.website,
    phone:       ldData.phone       ?? platformData.phone       ?? genericData.phone,
    description: ldData.description ?? platformData.description ?? genericData.description,
    eventName:   ldData.eventName   ?? platformData.eventName   ?? genericData.eventName,
    socialLinks: extractSocialLinks(html),
  };

// Emails that belong to platforms/systems rather than organizers
const NOISY_EMAIL_RE =
  /noreply|no-reply|donotreply|support|help|admin|info@eventbrite|info@meetup/i;

  // Fall back to scanning all emails in the HTML if none found via structured data
  if (!merged.email) {
    const emails = extractEmails(html);
    if (emails.length > 0) {
      // Prefer emails that likely belong to the organizer (not tracking/analytics)
      const preferred = emails.find((e) => !NOISY_EMAIL_RE.test(e));
      merged.email = preferred ?? emails[0];
    }
  }

  const name = merged.name ?? "Unknown Organizer";

  return {
    name,
    email: merged.email,
    website: merged.website,
    phone: merged.phone,
    description: merged.description,
    socialLinks: merged.socialLinks,
    eventUrl: url,
    eventName: merged.eventName,
    platform,
  };
}

// Map of platform → extractor function for platform-specific HTML parsing
const PLATFORM_EXTRACTORS: Record<
  string,
  (html: string) => Partial<ExtractedOrganizer>
> = {
  eventbrite: extractEventbrite,
  meetup:     extractMeetup,
  luma:       extractLuma,
  allevents:  extractAllevents,
  boomyshow:  extractBoomyshow,
};

const OrganizerResult = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().optional(),
  website: z.string().optional(),
  phone: z.string().optional(),
  description: z.string().optional(),
  socialLinks: z.array(
    z.object({ platform: z.string(), url: z.string() })
  ),
  eventUrl: z.string(),
  eventName: z.string().optional(),
  platform: z.string(),
  scrapedAt: z.number(),
  contactStatus: z.enum(["new", "contacted", "responded"]),
  error: z.string().optional().describe("Set when this URL could not be scraped"),
});

export const scraperServiceTool = createTool({
  id: "scraper-service",
  description: `
    Organizer Hunting Service.

    Accepts a list of event page URLs from supported platforms
    (Eventbrite, Meetup, Luma, Allevents, Boomyshow) and extracts structured
    organizer details from each page using JSON-LD structured data, meta tags,
    and platform-specific HTML patterns.

    Extracted records are automatically persisted to the organizers database
    (organizers.db) for outreach and product validation.

    Supported platforms:
    - Eventbrite  (eventbrite.com)
    - Meetup      (meetup.com)
    - Luma        (lu.ma)
    - Allevents   (allevents.in)
    - Boomyshow   (boomyshow.com)
    - Generic fallback for any other URL

    Returns per-URL results including name, email, website, social links, and
    a summary of how many organizers were successfully saved.
  `,
  inputSchema: z.object({
    urls: z
      .array(z.string().url())
      .min(1)
      .max(50)
      .describe("List of event page URLs to scrape (1–50)"),
    dbUrl: z
      .string()
      .optional()
      .default("file:./organizers.db")
      .describe("LibSQL database URL for persisting organizers"),
    timeoutMs: z
      .number()
      .optional()
      .default(15_000)
      .describe("Per-URL fetch timeout in milliseconds (default 15 000)"),
  }),
  outputSchema: z.object({
    results: z.array(OrganizerResult),
    saved: z.number().describe("Number of organizers successfully saved to DB"),
    failed: z.number().describe("Number of URLs that could not be scraped"),
    totalInDb: z.number().describe("Total organizer records now in the database"),
  }),

  execute: async ({ context }) => {
    const { urls, dbUrl, timeoutMs } = context;

    const store = new OrganizerStore(dbUrl);
    await store.init();

    const results: z.infer<typeof OrganizerResult>[] = [];
    let saved = 0;
    let failed = 0;

    for (const url of urls) {
      console.log(`[OrganizerScraper] Scraping: ${url}`);
      try {
        const data = await scrapeOrganizerFromUrl(url, timeoutMs);
        const record = await store.upsert(data);
        saved++;
        console.log(`[OrganizerScraper] ✅ Saved: ${record.name} (${record.platform})`);
        results.push({ ...record });
      } catch (err: any) {
        failed++;
        console.error(`[OrganizerScraper] ❌ Failed ${url}: ${err.message}`);
        results.push({
          id: "",
          name: "Unknown Organizer",
          socialLinks: [],
          eventUrl: url,
          platform: detectPlatform(url),
          scrapedAt: Date.now(),
          contactStatus: "new",
          error: err.message,
        });
      }
    }

    const totalInDb = await store.count();

    return { results, saved, failed, totalInDb };
  },
});
