import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const posts = await prisma.post.findMany();
  console.log(JSON.stringify(posts, null, 2));
}
main().finally(() => prisma.$disconnect());
