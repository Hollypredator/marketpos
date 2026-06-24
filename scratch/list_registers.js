const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const branchId = '6fa2b14d-5b37-43bd-a050-8e888c4c629e';
  const registers = await prisma.register.findMany({
    where: { branchId }
  });
  console.log(JSON.stringify(registers, null, 2));
}

main();
