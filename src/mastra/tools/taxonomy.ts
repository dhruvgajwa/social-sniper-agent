/**
 * Happenings Interest Taxonomy
 *
 * This file contains the complete taxonomy of interest categories
 * used for event classification and matching.
 */

export interface InterestCategory {
    name: string;
    secondaryCategories: string[];
    interests: string[];
}

export const INTEREST_CATEGORIES: InterestCategory[] = [
    {
        name: "Music",
        secondaryCategories: ["Live Music", "DJ/Club", "Concerts", "Music Festivals"],
        interests: [
            "Live Performances",
            "DJ Nights",
            "Classical Music",
            "Rock/Metal",
            "Electronic/EDM",
            "Jazz/Blues",
            "Hip-Hop/Rap",
            "Indie/Alternative",
            "Pop",
            "Karaoke",
            "Open Mic",
        ],
    },
    {
        name: "Entertainment",
        secondaryCategories: ["Comedy", "Theatre", "Movies", "Gaming"],
        interests: [
            "Stand-up Comedy",
            "Improv Shows",
            "Theatre/Drama",
            "Film Screenings",
            "Gaming Events",
            "Esports",
            "Board Games",
            "Trivia Nights",
            "Magic Shows",
            "Circus/Cabaret",
        ],
    },
    {
        name: "Food & Drink",
        secondaryCategories: ["Dining Experiences", "Bars & Pubs", "Food Events", "Workshops"],
        interests: [
            "Fine Dining",
            "Street Food",
            "Food Festivals",
            "Wine Tasting",
            "Beer/Brewery Tours",
            "Cocktail Events",
            "Cooking Classes",
            "Coffee/Tea Events",
            "Brunches",
            "Pop-up Restaurants",
        ],
    },
    {
        name: "Sports & Fitness",
        secondaryCategories: ["Watch Parties", "Participatory Sports", "Fitness Classes", "Adventure"],
        interests: [
            "Cricket",
            "Football/Soccer",
            "Running/Marathons",
            "Cycling",
            "Yoga",
            "CrossFit/HIIT",
            "Swimming",
            "Combat Sports",
            "Dance Classes",
            "Team Sports",
        ],
    },
    {
        name: "Arts & Culture",
        secondaryCategories: ["Visual Arts", "Museums", "Literary", "Cultural Events"],
        interests: [
            "Art Exhibitions",
            "Museum Visits",
            "Photography",
            "Book Clubs",
            "Poetry Events",
            "Writing Workshops",
            "Cultural Festivals",
            "Heritage Walks",
            "Craft Workshops",
            "Design Events",
        ],
    },
    {
        name: "Tech & Innovation",
        secondaryCategories: ["Meetups", "Conferences", "Workshops", "Hackathons"],
        interests: [
            "Tech Talks",
            "Startup Events",
            "AI/ML Workshops",
            "Web Development",
            "Product Management",
            "Blockchain/Web3",
            "Data Science",
            "Hackathons",
            "Coding Bootcamps",
            "Tech Networking",
        ],
    },
    {
        name: "Outdoor & Adventure",
        secondaryCategories: ["Nature", "Travel", "Extreme Sports", "Water Activities"],
        interests: [
            "Hiking/Trekking",
            "Camping",
            "Rock Climbing",
            "Kayaking/Rafting",
            "Cycling Tours",
            "Wildlife Safari",
            "Stargazing",
            "Beach Activities",
            "Paragliding",
            "Road Trips",
        ],
    },
    {
        name: "Wellness & Health",
        secondaryCategories: ["Mind & Body", "Alternative Healing", "Health Workshops", "Retreats"],
        interests: [
            "Meditation",
            "Sound Healing",
            "Spa/Wellness",
            "Mental Health Workshops",
            "Nutrition Seminars",
            "Holistic Health",
            "Breathwork",
            "Wellness Retreats",
            "Detox Programs",
            "Self-care Events",
        ],
    },
    {
        name: "Social & Networking",
        secondaryCategories: ["Professional", "Casual", "Community", "Dating"],
        interests: [
            "Networking Events",
            "Business Meetups",
            "Expat Gatherings",
            "Singles Events",
            "Community Cleanups",
            "Volunteer Events",
            "Language Exchange",
            "Hobby Groups",
            "Pet Meetups",
            "Themed Parties",
        ],
    },
];

/**
 * Get all available primary category names
 */
export function getPrimaryCategories(): string[] {
    return INTEREST_CATEGORIES.map((c) => c.name);
}

/**
 * Get all interests across all categories (flattened)
 */
export function getAllInterests(): string[] {
    return INTEREST_CATEGORIES.flatMap((c) => c.interests);
}

/**
 * Get all secondary categories (flattened)
 */
export function getAllSecondaryCategories(): string[] {
    return INTEREST_CATEGORIES.flatMap((c) => c.secondaryCategories);
}

/**
 * Find matching categories and interests based on keywords
 */
export function findMatchingTags(keywords: string[]): {
    categories: string[];
    secondaryCategories: string[];
    interests: string[];
} {
    const result = {
        categories: new Set<string>(),
        secondaryCategories: new Set<string>(),
        interests: new Set<string>(),
    };

    const normalizedKeywords = keywords.map((k) => k.toLowerCase());

    for (const category of INTEREST_CATEGORIES) {
        // Check primary category
        if (normalizedKeywords.some((k) => category.name.toLowerCase().includes(k))) {
            result.categories.add(category.name);
        }

        // Check secondary categories
        for (const secondary of category.secondaryCategories) {
            if (normalizedKeywords.some((k) => secondary.toLowerCase().includes(k))) {
                result.secondaryCategories.add(secondary);
                result.categories.add(category.name); // Also add parent
            }
        }

        // Check interests
        for (const interest of category.interests) {
            if (normalizedKeywords.some((k) => interest.toLowerCase().includes(k))) {
                result.interests.add(interest);
                result.categories.add(category.name); // Also add parent
            }
        }
    }

    return {
        categories: Array.from(result.categories),
        secondaryCategories: Array.from(result.secondaryCategories),
        interests: Array.from(result.interests),
    };
}

/**
 * Create a compact string representation of the taxonomy for AI prompts
 */
export function getTaxonomyPromptContext(): string {
    return INTEREST_CATEGORIES.map(
        (c) =>
            `**${c.name}**: ${c.secondaryCategories.join(", ")} | Interests: ${c.interests.slice(0, 5).join(", ")}...`
    ).join("\n");
}
