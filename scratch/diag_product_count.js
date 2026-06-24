const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const companyId = '07d27fba-9cc9-443e-a426-767184a15a31';
  
  const totalProducts = await prisma.product.count({ where: { companyId } });
  const activeProducts = await prisma.product.count({ 
    where: { companyId, isActive: true, deletedAt: null } 
  });
  const inactiveProducts = await prisma.product.count({ 
    where: { companyId, isActive: false } 
  });
  const deletedProducts = await prisma.product.count({ 
    where: { companyId, NOT: { deletedAt: null } } 
  });

  console.log(`Company ID: ${companyId}`);
  console.log(`Total Products in DB: ${totalProducts}`);
  console.log(`Active Products (isActive: true, deletedAt: null): ${activeProducts}`);
  console.log(`Inactive Products: ${inactiveProducts}`);
  console.log(`Deleted Products: ${deletedProducts}`);

  // Check branches
  const branches = await prisma.branch.findMany({ where: { companyId } });
  console.log(`Branches found: ${branches.length}`);
  for (const branch of branches) {
    const stockCount = await prisma.stockLevel.count({ where: { branchId: branch.id } });
    console.log(`- Branch: ${branch.name} (ID: ${branch.id}) - Products with Stock Records: ${stockCount}`);
  }

  // Check if some products are NOT in any category
  const noCategoryCount = await prisma.product.count({ where: { companyId, categoryId: null } });
  console.log(`Products without category: ${noCategoryCount}`);
}

main();
