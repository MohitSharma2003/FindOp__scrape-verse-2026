import express from "express";
import { errorHandler, notFoundHandler } from "./src/middleware/error-handler.js";

const app = express();
app.use(express.json({ limit: "256kb" }));
app.post("/test", (req, res) => res.json({ ok: true }));
app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(0, async () => {
  const port = server.address().port;
  try {
    const resp = await fetch("http://localhost:" + port + "/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{'invalid': json}",
    });
    console.log("Response status:", resp.status);
    const body = await resp.json();
    console.log("Response body:", JSON.stringify(body));
  } finally {
    server.close();
  }
});
