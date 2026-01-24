import { prisma } from "./client";

async function main() {
  const assets = [
    { symbol: "BTC", name: "Bitcoin", type: "crypto" },
    { symbol: "ETH", name: "Ethereum", type: "crypto" },
    { symbol: "SOL", name: "Solana", type: "crypto" },
  ];

  for (const a of assets) {
    await prisma.asset.upsert({
      where: { symbol: a.symbol },
      update: { name: a.name, type: a.type },
      create: a,
    });
  }
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
