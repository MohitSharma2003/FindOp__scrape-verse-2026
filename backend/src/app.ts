import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";

import opportunityRoutes from "./modules/opportunities/opportunity.routes.js";
import sourceRoutes from "./modules/sources/source.routes.js";
import scrapeRunRoutes from "./modules/scrape-runs/scrape-run.routes.js";
import { indexRoutes } from "./modules/index/index.stats.service.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { env } from "./config/env.js";
import searchRoutes from "./search/search.routes.js";
import discoveryRoutes from "./discovery/discovery.routes.js";
import extractionRoutes from "./extraction/extraction.routes.js";
import { demoRoutes } from "./demo/demo.routes.js";
import authRoutes from "./modules/auth/auth.routes.js";


const app = express();

app.use(helmet());
// In production, restrict origins via CORS_ORIGIN (comma-separated list).
const allowedOrigins = env.CORS_ORIGIN?.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
app.use(cors(allowedOrigins?.length ? { origin: allowedOrigins } : {}));
app.use(express.json({ limit: "256kb" }));
if (env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

app.use("/api/opportunities", opportunityRoutes);
app.use("/api/sources", sourceRoutes);
app.use("/api/scrape-runs", scrapeRunRoutes);
app.use("/api/index", indexRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/discovery", discoveryRoutes);
app.use("/api/extraction", extractionRoutes);
app.use("/api/demo", demoRoutes);
app.use("/api/auth", authRoutes);

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    success: true,
    data: { status: "ok", service: "findop-backend", timestamp: new Date().toISOString() },
  });
});

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
