#!/usr/bin/env node

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const sourceUrl = process.argv[2] || process.env.SOURCE_DATABASE_URL;
const targetUrl = process.env.DATABASE_URL;

if (!sourceUrl) {
  console.error("Missing source database URL. Pass it as the first argument or set SOURCE_DATABASE_URL.");
  process.exit(1);
}

if (!targetUrl) {
  console.error("Missing target DATABASE_URL in backend .env.");
  process.exit(1);
}

const source = new PrismaClient({ datasources: { db: { url: sourceUrl } } });
const target = new PrismaClient({ datasources: { db: { url: targetUrl } } });

const orderedModels = [
  "user",
  "profile",
  "refreshToken",
  "passwordResetToken",
  "userSetting",
  "privacySetting",
  "category",
  "club",
  "gig",
  "clubMember",
  "clubJoinRequest",
  "post",
  "comment",
  "like",
  "share",
  "report",
  "gigApplication",
  "adminActionLog",
];

const deleteOrder = [...orderedModels].reverse();

async function readAll(prisma) {
  const data = {};
  for (const modelName of orderedModels) {
    data[modelName] = await prisma[modelName].findMany();
  }
  return data;
}

function ensureBackupDir() {
  const backupDir = path.resolve(process.cwd(), "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  return backupDir;
}

async function writeBackup(data) {
  const backupDir = ensureBackupDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDir, `db-backup-${timestamp}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(data, null, 2), "utf8");
  return backupPath;
}

async function clearTarget() {
  for (const modelName of deleteOrder) {
    await target[modelName].deleteMany();
  }
}

async function insertBatch(modelName, rows) {
  if (!rows.length) return;
  await target[modelName].createMany({ data: rows });
}

async function insertComments(rows) {
  if (!rows.length) return;

  const pending = [...rows];
  const inserted = new Set();

  while (pending.length) {
    const ready = pending.filter((row) => !row.parentId || inserted.has(row.parentId));
    if (!ready.length) {
      throw new Error("Unable to resolve comment parent relationships during migration.");
    }

    for (const row of ready) {
      await target.comment.create({ data: row });
      inserted.add(row.id);
    }

    for (const row of ready) {
      const index = pending.findIndex((item) => item.id === row.id);
      if (index >= 0) pending.splice(index, 1);
    }
  }
}

async function copyData(data) {
  await insertBatch("user", data.user);
  await insertBatch("profile", data.profile);
  await insertBatch("refreshToken", data.refreshToken);
  await insertBatch("passwordResetToken", data.passwordResetToken);
  await insertBatch("userSetting", data.userSetting);
  await insertBatch("privacySetting", data.privacySetting);
  await insertBatch("category", data.category);
  await insertBatch("club", data.club);
  await insertBatch("gig", data.gig);
  await insertBatch("clubMember", data.clubMember);
  await insertBatch("clubJoinRequest", data.clubJoinRequest);
  await insertBatch("post", data.post);
  await insertComments(data.comment);
  await insertBatch("like", data.like);
  await insertBatch("share", data.share);
  await insertBatch("report", data.report);
  await insertBatch("gigApplication", data.gigApplication);
  await insertBatch("adminActionLog", data.adminActionLog);
}

function countsFor(data) {
  return Object.fromEntries(orderedModels.map((modelName) => [modelName, data[modelName].length]));
}

async function main() {
  console.log("Reading source database...");
  const sourceData = await readAll(source);
  console.log("Reading target database for backup...");
  const targetData = await readAll(target);

  const backupPath = await writeBackup(targetData);
  console.log(`Target backup written to ${backupPath}`);

  console.log("Clearing target database...");
  await clearTarget();

  console.log("Copying source data into target...");
  await copyData(sourceData);

  console.log("Verifying target counts...");
  const verifiedTargetData = await readAll(target);
  const sourceCounts = countsFor(sourceData);
  const targetCounts = countsFor(verifiedTargetData);

  console.log(JSON.stringify({ ok: true, backupPath, sourceCounts, targetCounts }, null, 2));
}

main()
  .catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.all([source.$disconnect(), target.$disconnect()]);
  });
