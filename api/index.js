import { createApp } from "../server/app.js";
import { pool } from "../server/db.js";

// Vercel owns the HTTP listener. Local development still uses server/index.js.
export default createApp(pool);
