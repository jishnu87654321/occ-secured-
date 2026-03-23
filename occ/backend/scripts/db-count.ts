import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const postsCount = await prisma.post.count();
  const clubsCount = await prisma.club.count();
  const usersCount = await prisma.user.count();
  console.log(`Posts: ${postsCount}, Clubs: ${clubsCount}, Users: ${usersCount}`);
}
main().finally(() => prisma.$disconnect());
