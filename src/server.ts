import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { config } from "./config.js";
import { researchRouter } from "./routes/research.js";

const app = express();

app.use(cors());
app.use(helmet());
app.use(morgan("dev"));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "curalink-backend" });
});

app.use("/api/research", researchRouter);

app.listen(config.port, () => {
  console.log(`Curalink backend listening on http://localhost:${config.port}`);
});
