export type PortfolioPositions = {
  portfolio: { id: string; name: string; currency: string };

  pricesSource: string;
  pricesAt: string | null;

  totals: {
    totalValue: string; // Decimal string
    totalCost: string; // Decimal string
    unrealizedPnl: string; // Decimal string
    realizedPnl: string; // Decimal string
  };

  positions: Array<{
    symbol: string;

    quantity: string; // Decimal string
    avgCost: string | null;
    costValue: string | null;

    price: number; // latest price (number, як у PricesService)
    value: string; // Decimal string

    unrealizedPnl: string | null;
    realizedPnl: string; // per-asset realized
  }>;

  warnings?: {
    missingTxPrices?: string[]; // якщо були BUY/SELL без price
    oversold?: string[]; // якщо SELL > holdings (ми клампимо)
  };
};
