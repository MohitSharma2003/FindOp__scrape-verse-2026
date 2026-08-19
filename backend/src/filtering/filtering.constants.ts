export const TYPE_ALIASES: Record<string, string> = {
  hackathon: "hackathon",
  internship: "internship",
  fellowship: "fellowship",
  scholarship: "scholarship",
  competition: "competition",
  "developer competition": "competition",
  grant: "grant",
  job: "job",
  conference: "conference",
  workshop: "workshop",
  accelerator: "accelerator",
  other: "other",
};

export const KEYWORD_ALIASES: Record<string, string[]> = {
  ai: ["ai", "artificial intelligence"],
  "artificial intelligence": ["ai", "artificial intelligence"],
  ml: ["ml", "machine learning"],
  "machine learning": ["ml", "machine learning"],
  web3: ["web3", "web 3", "blockchain"],
  "web 3": ["web3", "web 3", "blockchain"],
};

export const KNOWN_COUNTRIES = [
  "india", "united states", "usa", "uk", "united kingdom", "canada",
  "australia", "singapore", "germany", "france", "japan", "brazil",
  "uae", "united arab emirates",
];
