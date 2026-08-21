import { z } from "zod";

export const startHealingSchema = z.object({
  scrapeRunId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid scrape run ID").optional(),
});
