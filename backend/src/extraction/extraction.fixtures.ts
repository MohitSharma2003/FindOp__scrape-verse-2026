export const devpostProviderFixture = {
  title: "DevNetwork AI Hackathon 2026",
  organization: "DevNetwork",
  description: "Build AI and ML projects.",
  opportunity_type: "Hackathon",
  application_url: "https://devnetwork-ai-ml-hack-2026.devpost.com/",
  start_date: "2026-09-10",
  end_date: "2026-09-12",
  application_deadline: "2026-08-30",
  location: "Online",
  participation_mode: "Hybrid",
  eligibility: ["All countries"],
  required_skills_or_technologies: ["AI", "Python"],
  prize_or_rewards: "$8,000",
  source_url: "https://devnetwork-ai-ml-hack-2026.devpost.com/",
  input: { url: "https://devnetwork-ai-ml-hack-2026.devpost.com/" },
} as const;

export const openHackathonsProviderFixture = {
  title: "OpenHackathons AI Challenge",
  organization: "OpenHackathons",
  description: "An online challenge for builders.",
  opportunity_type: "Hackathon",
  application_url: "https://www.openhackathons.org/s/siteevent/a0CUP00004gn7e32AA/se000496",
  start_date: "2026-09-20",
  end_date: "2026-09-22",
  application_deadline: "2026-09-10",
  location: "Online",
  participation_mode: "Remote",
  eligibility: ["Developers"],
  required_skills_or_technologies: ["AI", "Cloud"],
  prize_or_rewards: "$5,000",
  source_url: "https://www.openhackathons.org/s/siteevent/a0CUP00004gn7e32AA/se000496",
  input: { url: "https://www.openhackathons.org/s/siteevent/a0CUP00004gn7e32AA/se000496" },
} as const;

export const genericCompanyProviderFixture = {
  title: "Company AI Innovation Challenge",
  organizer: "Example Labs",
  summary: "A company challenge for AI builders.",
  type: "Competition",
  applyUrl: "https://example.com/challenge/apply",
  startDate: "2026-10-01",
  endDate: "2026-10-05",
  deadline: "2026-09-25",
  venue: "Bengaluru, India",
  mode: "Hybrid",
  requirements: ["Students and professionals"],
  technologies: "AI, Python",
  prize: "$10,000",
  url: "https://example.com/challenge",
} as const;

export const sparseOpportunityFixture = {
  title: "AI Community Hackathon",
  url: "https://example.org/ai-hackathon",
  category: "Hackathon",
  description: "Applications are open.",
} as const;

export const malformedProviderFixture = {
  error: "provider returned no record",
} as const;
