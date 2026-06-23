import type { Request, Response, NextFunction } from "express";
import { env } from "./env.js";

export function requireBroadcastAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  let token: string | undefined;

  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    token = header.slice("Bearer ".length).trim();
  } else if (typeof req.query.token === "string") {
    token = req.query.token;
  }

  if (!token) {
    res.status(401).json({ error: "missing bearer token" });
    return;
  }
  if (token !== env.BROADCAST_SECRET) {
    res.status(403).json({ error: "invalid token" });
    return;
  }
  next();
}
