/**
 * Mastra Tools Index
 *
 * Central export for all tools used by the social-sniper-agent
 */

// Core Reddit/Social tools
export { redditMonitorTool } from "./reddit-monitor";
export { twitterMonitorTool } from "./twitter-monitor";
export { postToPlatformTool } from "./post-to-platform";
export { notificationTool } from "./notification";

// Event search tools (new enhanced version)
export { eventSearchTool } from "./event-search";
export { geocodingTool, getQuickCoordinates, INDIAN_CITY_COORDINATES } from "./geocoding";
export { intentToTagsTool, getAvailableTags } from "./intent-to-tags";

// Taxonomy utilities
export {
    INTEREST_CATEGORIES,
    getPrimaryCategories,
    getAllInterests,
    getAllSecondaryCategories,
    findMatchingTags,
    getTaxonomyPromptContext,
    type InterestCategory,
} from "./taxonomy";
