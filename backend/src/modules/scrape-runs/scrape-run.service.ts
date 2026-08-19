import {
  createScrapeRun,
  findAllScrapeRuns,
  findScrapeRunById,
} from "./scrape-run.repository.js";
import type { CreateScrapeRunInput } from "./scrape-run.schema.js";
import { getSourceById } from "../sources/source.service.js";

export async function getAllScrapeRuns() {
  return findAllScrapeRuns();
}

export async function getScrapeRunById(id: string) {
  return findScrapeRunById(id);
}

export async function createScrapeRunService(data: CreateScrapeRunInput) {
  const source = await getSourceById(data.sourceId);

  if (!source) {
    return null;
  }

  return createScrapeRun(data);
}
