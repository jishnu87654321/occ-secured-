import type { CorsOptions } from "cors";
import { env } from "./env";

const allowedOrigins = env.corsOrigin
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

function isOriginAllowed(origin: string) {
  if (allowedOrigins.includes(origin)) {
    return true;
  }

  const isVercelPreview = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);
  if (isVercelPreview && allowedOrigins.some((value) => value.endsWith(".vercel.app"))) {
    return true;
  }

  return false;
}

export const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (isOriginAllowed(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error("CORS origin not allowed"));
  },
  credentials: true
};
