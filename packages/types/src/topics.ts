import type { ChallengeCategory } from "./index.ts";

export interface TopicSeed {
  text: string;
  category: ChallengeCategory;
}

/**
 * Last-resort pool (spec section 27). Used when Gemini is unreachable and the
 * global challenge pool has nothing unseen left, and by the web mock API.
 * Deliberately small - the real topic space is generated, not stored.
 */
export const FALLBACK_TOPICS: TopicSeed[] = [
  { text: "Why did the Roman Empire build such an extensive road network?", category: "history" },
  { text: "Explain how GPS pinpoints your location to within a few metres.", category: "science_technology" },
  { text: "Describe how the Internet moves a message across the world.", category: "science_technology" },
  { text: "Why do companies care about brand identity more than product features?", category: "business_economics" },
  { text: "Explain inflation to a ten-year-old using only everyday examples.", category: "evergreen" },
  { text: "What would cities look like if personal cars had never been invented?", category: "future_scenarios" },
  { text: "Why do humans dream, and what do researchers still disagree about?", category: "science_technology" },
  { text: "Should social media platforms be treated like public utilities? Argue one side.", category: "current_trends" },
  { text: "How did the printing press change who controlled knowledge?", category: "history" },
  { text: "Explain why volcanoes form where they do.", category: "culture_geography" },
  { text: "What makes a great leader in a crisis? Use a historical example.", category: "evergreen" },
  { text: "If AI could translate every language instantly, what happens to cultural identity?", category: "future_scenarios" },
  { text: "Why does compound interest matter more than income for long-term wealth?", category: "business_economics" },
  { text: "Describe how vaccines train the human immune system.", category: "science_technology" },
  { text: "What can sports teach us about teamwork that classrooms cannot?", category: "evergreen" },
  { text: "How is remote work reshaping where people choose to live?", category: "current_trends" },
  { text: "Why do some languages disappear while others spread?", category: "culture_geography" },
  { text: "Explain what actually happens to a plastic bottle after you recycle it.", category: "evergreen" },
  { text: "Why did the Bronze Age civilisations collapse so suddenly?", category: "history" },
  { text: "What should a country do first if it discovers a huge new energy source?", category: "future_scenarios" },
];
