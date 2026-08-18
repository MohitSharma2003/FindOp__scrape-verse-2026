import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";

import opportunityRoutes from "./modules/opportunities/opportunity.routes.js";



const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

app.use("/api/opportunities", opportunityRoutes);

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "findop-backend",
    timestamp: new Date().toISOString(),
  });
});

export default app;
