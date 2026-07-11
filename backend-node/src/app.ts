import express, { Express } from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";
import jobsRouter from "./routes/jobs";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "/uploads";

export function createApp(): Express {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  const upload = multer({ dest: UPLOAD_DIR });
  const app = express();

  app.use(
    cors({ origin: process.env.FRONTEND_ORIGIN || "http://localhost:3000" }),
  );
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.use("/jobs", jobsRouter);

  app.post("/jobs/upload", upload.single("file"), (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "No file provided" });
      return;
    }
    const dest = path.join(UPLOAD_DIR, req.file.originalname);
    fs.renameSync(req.file.path, dest);
    res.json({ path: dest });
  });

  app.use("/uploads", express.static(UPLOAD_DIR));

  return app;
}
