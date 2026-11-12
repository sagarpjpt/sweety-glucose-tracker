import { spawn } from "node:child_process";
if (process.env.SWEETY_QA_DATABASE === "1") await import("./preview-db.js");
const children = [
  spawn(process.execPath, ["--env-file-if-exists=.env", "server/index.js"], {
    stdio: "inherit",
    env: { ...process.env, PORT: "3001" },
  }),
  spawn("npm", ["run", "client", "--", "--port", process.env.PORT || "5173"], {
    stdio: "inherit",
  }),
];
// Preview infrastructure reserves PORT for the frontend; API stays on 3001.
for (const c of children)
  c.on("exit", (code) => {
    for (const other of children) if (other !== c) other.kill();
    process.exit(code || 0);
  });
process.on("SIGTERM", () => children.forEach((c) => c.kill()));
process.on("SIGINT", () => children.forEach((c) => c.kill()));
