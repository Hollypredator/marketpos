import { PrismaClient } from '@prisma/client';

const basePrisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

const extendedPrisma = basePrisma.$extends({
  query: {
    companySubscriptionAudit: {
      async create({ args, query }) {
        const result = (await query(args)) as any;

        const webhookUrl = process.env.SUBSCRIPTION_WEBHOOK_URL;
        if (webhookUrl && result) {
          void (async () => {
            try {
              const company = await basePrisma.company.findFirst({
                select: { name: true },
                where: { id: result.companyId },
              });
              const companyName = company?.name || result.companyId;

              const noteText = result.note ? `\n📝 **Not:** ${result.note}` : '';
              const eventType = result.eventType as string || '';
              let emoji = '🔔';
              if (eventType === 'SYSTEM_SEED_FAILURE') {
                emoji = '🚨';
              } else if (eventType.startsWith('SUSPEND')) {
                emoji = '⛔';
              }

              await fetch(webhookUrl, {
                body: JSON.stringify({
                  content: `${emoji} **Abonelik Durum Değişikliği**\n\n🏢 **Firma:** \`${companyName}\` (\`${result.companyId}\`)\n🔑 **İşlem:** \`${eventType}\`\n🔄 **Durum:** \`${result.previousStatus || '-'}\` ➔ \`${result.nextStatus}\`${noteText}`,
                  username: 'MarketPOS Lisans Botu',
                }),
                headers: {
                  'Content-Type': 'application/json',
                },
                method: 'POST',
              });
            } catch (error) {
              console.error('[Webhook] Failed to send subscription webhook in prisma extension:', error);
            }
          })();
        }

        return result;
      },
    },
  },
});

const prisma = extendedPrisma as unknown as PrismaClient;

export default prisma;
