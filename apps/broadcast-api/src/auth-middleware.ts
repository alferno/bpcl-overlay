import type { Request, Response, NextFunction } from "express";
import { env } from "./env.js";

export function requireBroadcastAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "missing bearer token" });
    return;
  }
  const token = header.slice("Bearer ".length).trim();
  if (token !== env.BROADCAST_SECRET) {
    res.status(403).json({ error: "invalid token" });
    return;
  }
  next();
}
