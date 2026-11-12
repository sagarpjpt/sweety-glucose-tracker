import { createApp } from "./app.js";
import { pool } from "./db.js";
import express from "express";
import path from "node:path";
const app = createApp(pool);
app.use(express.static(path.resolve("dist")));
app.get("/{*path}", (req, res) =>
  res.sendFile(path.resolve("dist/index.html")),
);
const server = app.listen(Number(process.env.PORT || 3001), "0.0.0.0", () =>
  console.log("Sweety API on port " + (process.env.PORT || 3001)),
);
async function close() {
  server.close(async () => {
    await pool.end();
    process.exit();
  });
}
process.on("SIGTERM", close);
process.on("SIGINT", close);
