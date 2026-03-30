const { spawnSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

const backendRoot = path.resolve(__dirname, "..");
const migrationsDir = path.resolve(backendRoot, "prisma", "migrations");
const prismaCli = path.resolve(backendRoot, "node_modules", "prisma", "build", "index.js");

function runPrisma(args) {
  return spawnSync(process.execPath, [prismaCli, ...args], {
    cwd: backendRoot,
    stdio: "pipe"
  });
}

function writeOutput(result) {
  if (result.error) {
    process.stderr.write(`${result.error.message}\n`);
  }
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
}

function listMigrationNames() {
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }

  return fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(migrationsDir, entry.name, "migration.sql")))
    .map((entry) => entry.name)
    .sort();
}

function baselineExistingDatabase() {
  const migrationNames = listMigrationNames();
  if (migrationNames.length === 0) {
    console.warn("No local migration SQL files were found to baseline.");
    return 1;
  }

  console.warn("Existing database has no Prisma migration history. Marking checked-in migrations as applied...");

  for (const migrationName of migrationNames) {
    const result = runPrisma(["migrate", "resolve", "--applied", migrationName]);
    writeOutput(result);
    if (result.status !== 0) {
      return result.status ?? 1;
    }
  }

  return 0;
}

function extractMigrationName(output) {
  const namedMatch = output.match(/Migration name:\s*([A-Za-z0-9_-]+)/);
  if (namedMatch) {
    return namedMatch[1];
  }

  const failedRecordMatch = output.match(/The `([A-Za-z0-9_-]+)` migration started at/);
  if (failedRecordMatch) {
    return failedRecordMatch[1];
  }

  return null;
}

function recoverFailedMigration(combinedOutput) {
  const migrationName = extractMigrationName(combinedOutput);
  if (!migrationName) {
    return 1;
  }

  console.warn(`Recovering failed migration ${migrationName} by marking it rolled back before retrying...`);
  const resolveResult = runPrisma(["migrate", "resolve", "--rolled-back", migrationName]);
  writeOutput(resolveResult);
  return resolveResult.status ?? 1;
}

const migrateResult = runPrisma(["migrate", "deploy"]);
writeOutput(migrateResult);

if (migrateResult.status === 0) {
  process.exit(0);
}

const stdout = migrateResult.stdout ? String(migrateResult.stdout) : "";
const stderr = migrateResult.stderr ? String(migrateResult.stderr) : "";
const combined = `${stdout}\n${stderr}`;

const shouldFallback =
  combined.includes("P3005") ||
  combined.includes("The database schema is not empty") ||
  combined.includes("No migration found in prisma/migrations");

const shouldRecoverFailedMigration =
  (combined.includes("P3018") && combined.includes("Migration name:")) ||
  combined.includes("P3009");

if (shouldRecoverFailedMigration) {
  const recoverStatus = recoverFailedMigration(combined);
  if (recoverStatus !== 0) {
    process.exit(recoverStatus);
  }

  const retryAfterRecover = runPrisma(["migrate", "deploy"]);
  writeOutput(retryAfterRecover);
  process.exit(retryAfterRecover.status ?? 1);
}

if (!shouldFallback) {
  process.exit(migrateResult.status ?? 1);
}

const baselineStatus = baselineExistingDatabase();
if (baselineStatus !== 0) {
  process.exit(baselineStatus);
}

const retryResult = runPrisma(["migrate", "deploy"]);
writeOutput(retryResult);
process.exit(retryResult.status ?? 1);
