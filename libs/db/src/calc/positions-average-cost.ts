import { Prisma } from "@prisma/client";

export type AvgCostTx = {
  type: "BUY" | "SELL";
  symbol: string;
  quantity: Prisma.Decimal;
  price: Prisma.Decimal | null;
};

export type AvgCostPosition = {
  symbol: string;
  quantity: Prisma.Decimal;
  avgCost: Prisma.Decimal | null;
  costValue: Prisma.Decimal | null;
  price: number;
  value: Prisma.Decimal;
  unrealizedPnl: Prisma.Decimal | null;
  realizedPnl: Prisma.Decimal;
};

export type AvgCostResult = {
  positions: AvgCostPosition[];
  totals: {
    totalValue: Prisma.Decimal;
    totalCost: Prisma.Decimal;
    unrealizedPnl: Prisma.Decimal;
    realizedPnl: Prisma.Decimal;
  };
  warnings?: {
    missingTxPrices?: string[];
    oversold?: string[];
  };
};

export function calculatePositionsAverageCost(
  txs: AvgCostTx[],
  latestPrices: Record<string, number>,
): AvgCostResult {
  const D = Prisma.Decimal;
  const state: Record<
    string,
    {
      qty: Prisma.Decimal;
      cost: Prisma.Decimal;
      realized: Prisma.Decimal;
      missingPrice: boolean;
      oversold: boolean;
    }
  > = {};

  for (const t of txs) {
    const sym = t.symbol;
    const st =
      state[sym] ??
      (state[sym] = {
        qty: new D(0),
        cost: new D(0),
        realized: new D(0),
        missingPrice: false,
        oversold: false,
      });

    const qty = t.quantity;
    const price = t.price;

    if (price == null) st.missingPrice = true;
    const priceD = price ?? new D(0);

    if (t.type === "BUY") {
      st.qty = st.qty.add(qty);
      st.cost = st.cost.add(qty.mul(priceD));
      continue;
    }

    if (t.type === "SELL") {
      const avg = st.qty.gt(0) ? st.cost.div(st.qty) : new D(0);

      let sellQty = qty;
      if (sellQty.gt(st.qty)) {
        st.oversold = true;
        sellQty = st.qty;
      }
      if (sellQty.lte(0)) continue;

      const costBasisSold = avg.mul(sellQty);
      const proceeds = priceD.mul(sellQty);

      st.realized = st.realized.add(proceeds.sub(costBasisSold));
      st.qty = st.qty.sub(sellQty);
      st.cost = st.cost.sub(costBasisSold);

      if (st.qty.lte(0)) {
        st.qty = new D(0);
        st.cost = new D(0);
      }
    }
  }

  const symbols = Object.entries(state)
    .filter(([, st]) => st.qty.gt(0) || !st.realized.equals(0))
    .map(([s]) => s);

  const missingTxPrices: string[] = [];
  const oversold: string[] = [];

  let totalValue = new D(0);
  let totalCost = new D(0);
  let unrealizedPnl = new D(0);
  let realizedPnl = new D(0);

  const positions = symbols.map((sym) => {
    const st = state[sym];

    if (st.missingPrice) missingTxPrices.push(sym);
    if (st.oversold) oversold.push(sym);

    const priceNow = latestPrices[sym] ?? 0;
    const value = st.qty.mul(new D(priceNow));

    const avgCost = st.qty.gt(0) ? st.cost.div(st.qty) : null;
    const uPnl = st.qty.gt(0) ? value.sub(st.cost) : null;

    totalValue = totalValue.add(value);
    totalCost = totalCost.add(st.cost);
    realizedPnl = realizedPnl.add(st.realized);
    if (uPnl) unrealizedPnl = unrealizedPnl.add(uPnl);

    return {
      symbol: sym,
      quantity: st.qty,
      avgCost,
      costValue: st.qty.gt(0) ? st.cost : null,
      price: priceNow,
      value,
      unrealizedPnl: uPnl,
      realizedPnl: st.realized,
    };
  });

  positions.sort((a, b) => Number(b.value) - Number(a.value));

  return {
    positions,
    totals: { totalValue, totalCost, unrealizedPnl, realizedPnl },
    warnings:
      missingTxPrices.length || oversold.length
        ? {
            missingTxPrices: missingTxPrices.length
              ? missingTxPrices
              : undefined,
            oversold: oversold.length ? oversold : undefined,
          }
        : undefined,
  };
}
