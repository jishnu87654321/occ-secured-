import path from "path";
import { env } from "../config/env";

function getBackendOrigin() {
  return env.appUrl.replace(/\/api(?:\/v1)?\/?$/i, "").replace(/\/+$/, "");
}

export function normalizeUrl(filePath?: string | null) {
  if (!filePath) return null;
  if (/^(blob:|file:)/i.test(filePath)) return null;
  if (/^https?:\/\//i.test(filePath)) {
    try {
      const parsed = new URL(filePath);
      if (/^(localhost|127\.0\.0\.1)$/i.test(parsed.hostname) && parsed.pathname.startsWith("/uploads/")) {
        return `${getBackendOrigin()}${parsed.pathname}`;
      }
      return filePath;
    } catch {
      return filePath;
    }
  }
  if (/^[a-zA-Z]:[\\/]/.test(filePath)) return null;
  const normalized = filePath.replace(/\\/g, "/").replace(/^\/+/, "");
  return `${getBackendOrigin()}/${normalized}`;
}

export function fileToRelativeUrl(file?: Express.Multer.File) {
  if (!file) return null;
  const relativePath = path.join("uploads", file.filename).replace(/\\/g, "/");
  return normalizeUrl(relativePath);
}
