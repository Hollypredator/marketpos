import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

function toMinor(value: number): bigint {
  return BigInt(Math.round(value * 100));
}

async function main() {
  const now = new Date();
  const packageExpiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  const packageGraceEndsAt = new Date(
    packageExpiresAt.getTime() + 7 * 24 * 60 * 60 * 1000,
  );
  console.log('🌱 Seed başlatılıyor...');

  // Demo firma
  const company = await prisma.company.create({
    data: {
      name: 'Demo Market A.Ş.',
      taxNumber: '1234567890',
      address: 'İstanbul, Türkiye',
      licenseKey: 'MP-DEMO-YEAR-2026-KEYS',
      licenseKeyActivatedAt: now,
      packageStartedAt: now,
      packageExpiresAt,
      packageGraceEndsAt,
      phone: '0212 123 45 67',
    },
  });
  console.log('✅ Firma oluşturuldu:', company.name);

  // Şube
  const branch = await prisma.branch.create({
    data: { companyId: company.id, name: 'Merkez Şube', address: 'Kadıköy, İstanbul' },
  });
  console.log('✅ Şube oluşturuldu:', branch.name);

  // Kasa
  const register = await prisma.register.create({
    data: { branchId: branch.id, name: 'K01' },
  });
  console.log('✅ Kasa oluşturuldu:', register.name);

  // Admin kullanıcı
  const adminHash = await bcrypt.hash('admin123', 12);
  const admin = await prisma.user.create({
    data: { companyId: company.id, branchId: branch.id, username: 'admin', email: 'admin@marketpos.com', passwordHash: adminHash, fullName: 'Sistem Yöneticisi', role: 'ADMIN' },
  });
  console.log('✅ Admin oluşturuldu:', admin.username);

  // Super Admin kullanıcı (Platform Owner)
  const superAdminHash = await bcrypt.hash('admin123', 12);
  const superAdmin = await prisma.user.create({
    data: { companyId: company.id, branchId: branch.id, username: 'superadmin', email: 'superadmin@marketpos.com', passwordHash: superAdminHash, fullName: 'Platform Sahibi', role: 'SUPER_ADMIN' },
  });
  console.log('✅ Super Admin oluşturuldu:', superAdmin.username);

  // Kasiyer
  const cashierHash = await bcrypt.hash('1234', 12);
  const cashier = await prisma.user.create({
    data: { companyId: company.id, branchId: branch.id, username: 'kasiyer1', passwordHash: cashierHash, pin: '1234', fullName: 'Ahmet Kasiyer', role: 'CASHIER' },
  });
  console.log('✅ Kasiyer oluşturuldu:', cashier.username);

  // Kategoriler
  const cats = await Promise.all([
    prisma.category.create({ data: { companyId: company.id, name: 'İçecekler', sortOrder: 1, color: '#3B82F6' } }),
    prisma.category.create({ data: { companyId: company.id, name: 'Atıştırmalık', sortOrder: 2, color: '#F59E0B' } }),
    prisma.category.create({ data: { companyId: company.id, name: 'Temel Gıda', sortOrder: 3, color: '#10B981' } }),
    prisma.category.create({ data: { companyId: company.id, name: 'Süt Ürünleri', sortOrder: 4, color: '#8B5CF6' } }),
    prisma.category.create({ data: { companyId: company.id, name: 'Temizlik', sortOrder: 5, color: '#EC4899' } }),
  ]);
  console.log('✅ Kategoriler oluşturuldu');

  // Ürünler
  const products = [
    { barcode: '8690001', name: 'Su 0.5L', categoryId: cats[0].id, purchasePrice: 3, salePrice: 5, vatRate: 10 },
    { barcode: '8690002', name: 'Kola 330ml', categoryId: cats[0].id, purchasePrice: 8, salePrice: 15, vatRate: 10 },
    { barcode: '8690003', name: 'Ayran 200ml', categoryId: cats[0].id, purchasePrice: 4, salePrice: 8, vatRate: 10 },
    { barcode: '8690004', name: 'Meyve Suyu 1L', categoryId: cats[0].id, purchasePrice: 15, salePrice: 28, vatRate: 10 },
    { barcode: '8690010', name: 'Cips', categoryId: cats[1].id, purchasePrice: 10, salePrice: 20, vatRate: 10 },
    { barcode: '8690011', name: 'Çikolata', categoryId: cats[1].id, purchasePrice: 8, salePrice: 18, vatRate: 10 },
    { barcode: '8690012', name: 'Bisküvi', categoryId: cats[1].id, purchasePrice: 5, salePrice: 12, vatRate: 10 },
    { barcode: '8690020', name: 'Ekmek', categoryId: cats[2].id, purchasePrice: 5, salePrice: 10, vatRate: 1, isQuickAccess: true, quickAccessColor: '#F59E0B', quickAccessOrder: 1 },
    { barcode: '8690021', name: 'Makarna 500g', categoryId: cats[2].id, purchasePrice: 8, salePrice: 15, vatRate: 10 },
    { barcode: '8690022', name: 'Pirinç 1kg', categoryId: cats[2].id, purchasePrice: 25, salePrice: 45, vatRate: 1 },
    { barcode: '8690023', name: 'Un 2kg', categoryId: cats[2].id, purchasePrice: 20, salePrice: 35, vatRate: 1 },
    { barcode: '8690024', name: 'Şeker 1kg', categoryId: cats[2].id, purchasePrice: 15, salePrice: 30, vatRate: 1 },
    { barcode: '8690030', name: 'Süt 1L', categoryId: cats[3].id, purchasePrice: 15, salePrice: 30, vatRate: 10 },
    { barcode: '8690031', name: 'Peynir 250g', categoryId: cats[3].id, purchasePrice: 25, salePrice: 50, vatRate: 10 },
    { barcode: '8690032', name: 'Yoğurt 500g', categoryId: cats[3].id, purchasePrice: 12, salePrice: 25, vatRate: 10 },
    { barcode: '8690040', name: 'Bulaşık Deterjanı', categoryId: cats[4].id, purchasePrice: 20, salePrice: 40, vatRate: 20 },
    { barcode: '8690041', name: 'Çamaşır Deterjanı', categoryId: cats[4].id, purchasePrice: 40, salePrice: 75, vatRate: 20 },
    { barcode: '8690042', name: 'Tuvalet Kağıdı', categoryId: cats[4].id, purchasePrice: 30, salePrice: 55, vatRate: 20, isQuickAccess: true, quickAccessColor: '#EC4899', quickAccessOrder: 2 },
    { barcode: '8690050', name: 'Poşet', categoryId: null, purchasePrice: 0.5, salePrice: 1, vatRate: 20, isQuickAccess: true, quickAccessColor: '#6B7280', quickAccessOrder: 3 },
  ];

  for (const p of products) {
    await prisma.product.create({
      data: {
        companyId: company.id,
        ...p,
        minStock: 10,
        purchasePriceMinor: toMinor(p.purchasePrice),
        salePriceMinor: toMinor(p.salePrice),
      },
    });
  }
  console.log(`✅ ${products.length} ürün oluşturuldu`);

  // Başlangıç stokları
  for (const p of products) {
    const product = await prisma.product.findFirst({ where: { barcode: p.barcode } });
    if (product) {
      await prisma.stockLevel.create({
        data: { productId: product.id, branchId: branch.id, quantity: 100 },
      });
    }
  }
  console.log('✅ Başlangıç stokları oluşturuldu');

  console.log('\n🎉 Seed tamamlandı!');
  console.log('📋 Giriş bilgileri:');
  console.log('   Super Admin → kullanıcı: superadmin, e-posta: superadmin@marketpos.com, şifre: admin123');
  console.log('   Admin       → kullanıcı: admin, e-posta: admin@marketpos.com, şifre: admin123');
  console.log('   Kasiyer     → kullanıcı: kasiyer1, şifre: 1234, PIN: 1234');
}

main().catch(console.error).finally(() => prisma.$disconnect());
