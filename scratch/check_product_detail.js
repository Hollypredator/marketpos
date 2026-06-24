const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const product = await prisma.product.findFirst({
    where: { barcode: '2907001' }
  });
  console.log(JSON.stringify(product, null, 2));
}

main();
