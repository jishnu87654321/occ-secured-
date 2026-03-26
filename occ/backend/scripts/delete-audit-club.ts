/// <reference types="node" />

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.club.deleteMany({
    where: {
      OR: [
        { name: { contains: "Audit", mode: "insensitive" } },
        { slug: "audit-club" }
      ]
    }
  });

  console.log(`Deleted ${result.count} clubs.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
