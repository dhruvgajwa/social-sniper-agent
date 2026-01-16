import { createTool } from "@mastra/core/tools";
import { z } from "zod";

/**
 * When (Time) Extraction Tool
 *
 * Parses temporal expressions from user queries and converts them to
 * date ranges compatible with the Happenings API.
 *
 * Supports:
 * - Relative: "today", "tomorrow", "this weekend", "next week"
 * - Absolute: "January 20", "20th Jan", "20/01/2026"
 * - Ranges: "this week", "next month"
 */

/**
 * Get the start and end of today (in IST)
 */
function getToday(): Date {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
}

/**
 * Get tomorrow's date
 */
function getTomorrow(): Date {
    const tomorrow = getToday();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
}

/**
 * Get this weekend (Saturday and Sunday)
 */
function getThisWeekend(): { start: Date; end: Date } {
    const today = getToday();
    const dayOfWeek = today.getDay(); // 0 = Sunday, 6 = Saturday

    // Calculate days until Saturday
    const daysUntilSaturday = dayOfWeek === 0 ? 6 : 6 - dayOfWeek;
    const saturday = new Date(today);
    saturday.setDate(today.getDate() + daysUntilSaturday);

    // Sunday is Saturday + 1
    const sunday = new Date(saturday);
    sunday.setDate(saturday.getDate() + 1);
    sunday.setHours(23, 59, 59, 999);

    return { start: saturday, end: sunday };
}

/**
 * Get next week (Monday to Sunday)
 */
function getNextWeek(): { start: Date; end: Date } {
    const today = getToday();
    const dayOfWeek = today.getDay();

    // Calculate days until next Monday
    const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
    const monday = new Date(today);
    monday.setDate(today.getDate() + daysUntilMonday);

    // Next Sunday
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    return { start: monday, end: sunday };
}

/**
 * Format date as DD/MM/YYYY for API
 */
function formatDateForAPI(date: Date): string {
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

/**
 * Temporal patterns to match
 */
const TEMPORAL_PATTERNS: Array<{
    patterns: RegExp[];
    resolver: () => { value: string; type: "keyword" | "range" | "date"; start?: Date; end?: Date };
}> = [
        {
            patterns: [/\btoday\b/i, /\btonight\b/i, /\bthis\s*evening\b/i],
            resolver: () => ({
                value: "today",
                type: "keyword",
                start: getToday(),
                end: getToday(),
            }),
        },
        {
            patterns: [/\btomorrow\b/i],
            resolver: () => {
                const tomorrow = getTomorrow();
                return {
                    value: "tomorrow",
                    type: "keyword",
                    start: tomorrow,
                    end: tomorrow,
                };
            },
        },
        {
            patterns: [
                /\b(this\s*)?weekend\b/i,
                /\bsat(?:urday)?\s*(?:and|&|or)\s*sun(?:day)?\b/i,
            ],
            resolver: () => {
                const weekend = getThisWeekend();
                return {
                    value: "weekend",
                    type: "keyword",
                    start: weekend.start,
                    end: weekend.end,
                };
            },
        },
        {
            patterns: [/\bnext\s*week(?:end)?\b/i],
            resolver: () => {
                const nextWeek = getNextWeek();
                return {
                    value: `${formatDateForAPI(nextWeek.start)} - ${formatDateForAPI(nextWeek.end)}`,
                    type: "range",
                    start: nextWeek.start,
                    end: nextWeek.end,
                };
            },
        },
        {
            patterns: [/\bthis\s*week\b/i],
            resolver: () => {
                const today = getToday();
                const endOfWeek = new Date(today);
                const daysUntilSunday = 7 - today.getDay();
                endOfWeek.setDate(today.getDate() + daysUntilSunday);
                endOfWeek.setHours(23, 59, 59, 999);
                return {
                    value: `${formatDateForAPI(today)} - ${formatDateForAPI(endOfWeek)}`,
                    type: "range",
                    start: today,
                    end: endOfWeek,
                };
            },
        },
        {
            patterns: [/\bthis\s*month\b/i],
            resolver: () => {
                const today = getToday();
                const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                return {
                    value: `${formatDateForAPI(today)} - ${formatDateForAPI(endOfMonth)}`,
                    type: "range",
                    start: today,
                    end: endOfMonth,
                };
            },
        },
    ];

/**
 * Month name to number mapping
 */
const MONTHS: Record<string, number> = {
    jan: 0, january: 0,
    feb: 1, february: 1,
    mar: 2, march: 2,
    apr: 3, april: 3,
    may: 4,
    jun: 5, june: 5,
    jul: 6, july: 6,
    aug: 7, august: 7,
    sep: 8, september: 8, sept: 8,
    oct: 9, october: 9,
    nov: 10, november: 10,
    dec: 11, december: 11,
};

/**
 * Parse absolute date mentions like "January 20", "20th Jan", "20/01/2026"
 */
function parseAbsoluteDate(query: string): Date | null {
    // Try "Month Day" format: "January 20", "Jan 20th"
    const monthDayMatch = query.match(
        /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s*(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?\b/i
    );
    if (monthDayMatch) {
        const month = MONTHS[monthDayMatch[1].toLowerCase().substring(0, 3)];
        const day = parseInt(monthDayMatch[2], 10);
        const year = monthDayMatch[3] ? parseInt(monthDayMatch[3], 10) : new Date().getFullYear();
        if (month !== undefined && day >= 1 && day <= 31) {
            return new Date(year, month, day);
        }
    }

    // Try "Day Month" format: "20 January", "20th Jan"
    const dayMonthMatch = query.match(
        /\b(\d{1,2})(?:st|nd|rd|th)?\s*(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s*,?\s*(\d{4}))?\b/i
    );
    if (dayMonthMatch) {
        const day = parseInt(dayMonthMatch[1], 10);
        const month = MONTHS[dayMonthMatch[2].toLowerCase().substring(0, 3)];
        const year = dayMonthMatch[3] ? parseInt(dayMonthMatch[3], 10) : new Date().getFullYear();
        if (month !== undefined && day >= 1 && day <= 31) {
            return new Date(year, month, day);
        }
    }

    // Try "DD/MM/YYYY" or "DD-MM-YYYY" format
    const dateSlashMatch = query.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/);
    if (dateSlashMatch) {
        const day = parseInt(dateSlashMatch[1], 10);
        const month = parseInt(dateSlashMatch[2], 10) - 1;
        const year = parseInt(dateSlashMatch[3], 10);
        if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
            return new Date(year, month, day);
        }
    }

    return null;
}

export const whenTool = createTool({
    id: "when",
    description: `
    Extracts temporal information from user query for event search.
    
    Parses natural language time expressions and converts to API format:
    - "today", "tomorrow", "weekend" → keywords for API
    - Specific dates → DD/MM/YYYY format
    - Ranges → "DD/MM/YYYY - DD/MM/YYYY" format
    
    Examples:
    - "events today" → { value: "today", type: "keyword" }
    - "what's happening this weekend" → { value: "weekend", type: "keyword" }
    - "concerts on January 20" → { value: "20/01/2025", type: "date" }
    - "events next week" → { value: "27/01/2025 - 02/02/2025", type: "range" }
  `,
    inputSchema: z.object({
        query: z.string().describe("The user's query to parse for time information"),
    }),
    outputSchema: z.object({
        success: z.boolean(),
        when: z
            .object({
                value: z.string().describe("Value to pass to API (keyword, date, or range)"),
                type: z.enum(["keyword", "date", "range"]).describe("Type of temporal value"),
                displayText: z.string().optional().describe("Human-readable description"),
                startDate: z.string().optional().describe("ISO date string of start"),
                endDate: z.string().optional().describe("ISO date string of end"),
            })
            .optional(),
        detected: z.boolean().describe("Whether any time expression was detected"),
        reasoning: z.string().optional(),
        error: z.string().optional(),
    }),
    execute: async ({ context }) => {
        const { query } = context;

        try {
            // Check temporal patterns
            for (const temporal of TEMPORAL_PATTERNS) {
                for (const pattern of temporal.patterns) {
                    if (pattern.test(query)) {
                        const result = temporal.resolver();
                        return {
                            success: true,
                            when: {
                                value: result.value,
                                type: result.type as "keyword" | "date" | "range",
                                displayText: result.value,
                                startDate: result.start?.toISOString(),
                                endDate: result.end?.toISOString(),
                            },
                            detected: true,
                            reasoning: `Matched temporal pattern: "${result.value}"`,
                        };
                    }
                }
            }

            // Try absolute date parsing
            const absoluteDate = parseAbsoluteDate(query);
            if (absoluteDate) {
                const formatted = formatDateForAPI(absoluteDate);
                return {
                    success: true,
                    when: {
                        value: formatted,
                        type: "date" as const,
                        displayText: absoluteDate.toLocaleDateString("en-IN", {
                            weekday: "long",
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                        }),
                        startDate: absoluteDate.toISOString(),
                        endDate: absoluteDate.toISOString(),
                    },
                    detected: true,
                    reasoning: `Parsed absolute date: ${formatted}`,
                };
            }

            // No time expression found
            return {
                success: true,
                detected: false,
                reasoning: "No time expression detected, will search all upcoming events",
            };
        } catch (error) {
            return {
                success: false,
                detected: false,
                error: error instanceof Error ? error.message : "Unknown error parsing time",
            };
        }
    },
});
