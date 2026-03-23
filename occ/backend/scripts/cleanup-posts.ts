import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  // Delete posts with missing images found in logs
  const deleted = await prisma.post.deleteMany({
    where: {
      id: {
        in: ["cmn30has2000hu7lw19rmev93", "cmn30jwax000ju7lwpw1h69ny"]
      }
    }
  });
  console.log(`Deleted ${deleted.count} broken posts.`);
}

main().finally(() => prisma.$disconnect());
