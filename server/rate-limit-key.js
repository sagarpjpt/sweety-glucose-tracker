import { ipAddress } from "@vercel/functions";
import { ipKeyGenerator } from "express-rate-limit";

export function rateLimitKey(req) {
  // Only trust Vercel's client-IP header inside the Vercel runtime.
  const clientIp = process.env.VERCEL
    ? ipAddress({ get: (name) => req.get(name) ?? null })
    : undefined;
  return ipKeyGenerator(clientIp || req.ip);
}
