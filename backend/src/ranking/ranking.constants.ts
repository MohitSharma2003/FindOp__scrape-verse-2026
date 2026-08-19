export const RANKING_WEIGHTS = {
  type: 15,
  keywords: 20,
  location: 15,
  mode: 10,
  date: 10,
  deadline: 10,
  skills: 10,
  eligibility: 5,
  completeness: 5,
} as const;

export const RANKING_KEYWORD_ALIASES: Record<string, string[]> = {
  ai: ["ai", "artificial intelligence"],
  "artificial intelligence": ["ai", "artificial intelligence"],
  ml: ["ml", "machine learning"],
  "machine learning": ["ml", "machine learning"],
  web3: ["web3", "web 3", "blockchain"],
  "web 3": ["web3", "web 3", "blockchain"],
};
