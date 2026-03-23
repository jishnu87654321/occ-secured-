#!/usr/bin/env node

require("dotenv").config();
const http = require("http");
const https = require("https");

const args = process.argv.slice(2);

function request(url) {
  const client = url.startsWith("https") ? https : http;
  return new Promise((resolve, reject) => {
    const req = client.get(url, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        resolve({
          statusCode: res.statusCode,
          body: Buffer.concat(chunks).toString("utf8")
        });
      });
    });
    req.on("error", reject);
  });
}

async function main() {
  if (args.includes("--db-check")) {
    const required = ["DATABASE_URL", "DIRECT_URL", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"];
    const missing = required.filter((key) => !process.env[key]);
    if (missing.length > 0) {
      console.error(`Missing required env vars: ${missing.join(", ")}`);
      process.exit(1);
    }
    console.log("Environment DB check passed");
    return;
  }

  const baseUrl = process.env.SMOKE_BASE_URL;
  if (!baseUrl) {
    console.error("SMOKE_BASE_URL is required for smoke checks");
    process.exit(1);
  }

  const checks = [
    { name: "health", url: `${baseUrl}/health`, expect: 200 },
    { name: "ready", url: `${baseUrl}/ready`, expect: 200 },
    { name: "auth login route", url: `${baseUrl}/api/v1/auth/login`, expect: 404, method: "GET" },
    { name: "feed route", url: `${baseUrl}/api/v1/feed`, expect: 200 },
    { name: "clubs route", url: `${baseUrl}/api/v1/clubs`, expect: 200 },
    { name: "admin route protected", url: `${baseUrl}/api/v1/occ-gate-842/dashboard`, expect: 401 }
  ];

  for (const check of checks) {
    const result = await request(check.url);
    if (result.statusCode !== check.expect) {
      console.error(`Smoke check failed for ${check.name}: expected ${check.expect}, got ${result.statusCode}`);
      process.exit(1);
    }
  }

  console.log("Smoke checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
