export const userRoutes = [
  ["/discover", "Discover"],
  ["/opportunities", "Opportunities"],
  ["/saved", "Saved"],
  ["/deadlines", "Deadlines"],
  ["/preferences", "Preferences"],
  ["/profile", "Profile"],
] as const;

export const consoleRoutes = [
  ["/console", "Overview"],
  ["/console/sources", "Sources"],
  ["/console/runs", "Scrape runs"],
  ["/console/validation", "Validation"],
  ["/console/healing", "Self-healing"],
  ["/console/opportunities", "Opportunities"],
  ["/console/system", "System"],
] as const;
