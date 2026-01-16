/**
 * UTM Link Generator
 *
 * Generates Happenings event URLs with UTM tracking parameters.
 * Used for tracking attribution from Reddit bot recommendations.
 *
 * Based on the Happenings UTM system (base64 encoded parameters).
 */

const BASE_URL = "https://happenings.dhruvgajwa.com";

/**
 * Platform configurations for UTM medium
 */
const PLATFORMS: Record<string, { medium: string }> = {
    reddit: { medium: "social" },
    twitter: { medium: "social" },
    instagram: { medium: "social" },
    linkedin: { medium: "social" },
    facebook: { medium: "social" },
    telegram: { medium: "messaging" },
    whatsapp: { medium: "messaging" },
    email: { medium: "email" },
};

/**
 * UTM parameter structure
 */
interface UTMParams {
    utm_source: string;
    utm_medium: string;
    utm_campaign?: string;
    utm_content?: string;
    ref?: string;
}

/**
 * Generate a Happenings event URL with UTM tracking
 *
 * @param eventId - The event ID from the Happenings database
 * @param options - UTM tracking options
 * @returns Complete URL with UTM parameters
 *
 * @example
 * generateEventUrl("abc123")
 * // => "https://happenings.dhruvgajwa.com/event/abc123?u=eyJ1dG1fc291cmNlIjoi..."
 *
 * @example
 * generateEventUrl("abc123", { campaign: "weekend_reco", content: "jazz_events" })
 * // => "https://happenings.dhruvgajwa.com/event/abc123?u=eyJ1dG1fc291cmNlIjoi..."
 */
export function generateEventUrl(
    eventId: string,
    options: {
        source?: string;
        campaign?: string;
        content?: string;
        postId?: string;
    } = {}
): string {
    const {
        source = "reddit",
        campaign = "happenings_bot",
        content,
        postId,
    } = options;

    // Build UTM parameters
    const utmParams: UTMParams = {
        utm_source: source.toLowerCase(),
        utm_medium: PLATFORMS[source.toLowerCase()]?.medium || "social",
    };

    if (campaign) {
        utmParams.utm_campaign = campaign;
    }

    if (content) {
        utmParams.utm_content = content;
    }

    if (postId) {
        // Encode post ID for attribution tracking
        utmParams.ref = Buffer.from(postId).toString("base64").replace(/=/g, "");
    }

    // Base64 encode the entire UTM object for privacy
    const utmJson = JSON.stringify(utmParams);
    const encodedUtm = Buffer.from(utmJson).toString("base64").replace(/=/g, "");

    // Construct the full URL
    return `${BASE_URL}/event/${eventId}?u=${encodedUtm}`;
}

/**
 * Generate a city page URL with UTM tracking
 *
 * @param city - City name (e.g., "bangalore", "mumbai")
 * @param options - UTM tracking options
 * @returns Complete URL with UTM parameters
 *
 * @example
 * generateCityUrl("bangalore")
 * // => "https://happenings.dhruvgajwa.com/city/bangalore?u=..."
 */
export function generateCityUrl(
    city: string,
    options: {
        source?: string;
        campaign?: string;
        content?: string;
        postId?: string;
    } = {}
): string {
    const {
        source = "reddit",
        campaign = "happenings_bot",
        content,
        postId,
    } = options;

    // Normalize city name for URL
    const normalizedCity = city.toLowerCase().replace(/\s+/g, "-");

    // Build UTM parameters
    const utmParams: UTMParams = {
        utm_source: source.toLowerCase(),
        utm_medium: PLATFORMS[source.toLowerCase()]?.medium || "social",
    };

    if (campaign) {
        utmParams.utm_campaign = campaign;
    }

    if (content) {
        utmParams.utm_content = content;
    }

    if (postId) {
        utmParams.ref = Buffer.from(postId).toString("base64").replace(/=/g, "");
    }

    // Base64 encode
    const utmJson = JSON.stringify(utmParams);
    const encodedUtm = Buffer.from(utmJson).toString("base64").replace(/=/g, "");

    return `${BASE_URL}/city/${normalizedCity}?u=${encodedUtm}`;
}

/**
 * Generate a simple event URL without UTM (for display purposes)
 */
export function getEventPageUrl(eventId: string): string {
    return `${BASE_URL}/event/${eventId}`;
}

/**
 * Generate a simple city URL without UTM
 */
export function getCityPageUrl(city: string): string {
    const normalizedCity = city.toLowerCase().replace(/\s+/g, "-");
    return `${BASE_URL}/city/${normalizedCity}`;
}

/**
 * Check if a URL is a Happenings URL
 */
export function isHappeningsUrl(url: string): boolean {
    return url.startsWith(BASE_URL);
}

/**
 * Extract event ID from a Happenings URL
 */
export function extractEventId(url: string): string | null {
    const match = url.match(/\/event\/([a-zA-Z0-9]+)/);
    return match ? match[1] : null;
}
