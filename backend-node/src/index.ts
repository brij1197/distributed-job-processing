import express from "express";
import cors from "cors";
import jobsRouter from "./routes/jobs";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: "http://localhost:3000" }));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.use("/jobs", jobsRouter);

app.listen(PORT, () => {
  console.log(`API is running on port ${PORT}`);
});
