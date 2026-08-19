import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";

import opportunityRoutes from "./modules/opportunities/opportunity.routes.js";
import sourceRoutes from "./modules/sources/source.routes.js";
import scrapeRunRoutes from "./modules/scrape-runs/scrape-run.routes.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import searchRoutes from "./search/search.routes.js";
import discoveryRoutes from "./discovery/discovery.routes.js";
import extractionRoutes from "./extraction/extraction.routes.js";


const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "256kb" }));
app.use(morgan("dev"));

app.use("/api/opportunities", opportunityRoutes);
app.use("/api/sources", sourceRoutes);
app.use("/api/scrape-runs", scrapeRunRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/discovery", discoveryRoutes);
app.use("/api/extraction", extractionRoutes);

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    success: true,
    data: { status: "ok", service: "findop-backend", timestamp: new Date().toISOString() },
  });
});

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
