export type PortfolioSummary = {
  portfolio: { id: string; name: string; currency: string };
  pricesSource: string;
  pricesAt: string | null;
  totalValue: number;
  holdings: Array<{
    symbol: string;
    quantity: number;
    price: number;
    value: number;
  }>;
};
