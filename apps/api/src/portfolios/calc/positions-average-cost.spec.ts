import { Prisma } from '@prisma/client';
import { calculatePositionsAverageCost } from '@cpt/db';

const D = Prisma.Decimal;

describe('calculatePositionsAverageCost', () => {
  it('buy + sell дає правильний realized/unrealized', () => {
    const res = calculatePositionsAverageCost(
      [
        {
          type: 'BUY',
          symbol: 'BTC',
          quantity: new D('0.01'),
          price: new D('52000'),
        },
        {
          type: 'SELL',
          symbol: 'BTC',
          quantity: new D('0.004'),
          price: new D('60000'),
        },
      ],
      { BTC: 68219 },
    );

    const p = res.positions[0];
    expect(p.quantity.toString()).toBe('0.006');
    expect(res.totals.realizedPnl.toString()).toBe('32');
    expect(p.value.toString()).toBe('409.314');
    expect(p.unrealizedPnl?.toString()).toBe('97.314');
  });

  it('multiple buys -> avg cost працює', () => {
    const res = calculatePositionsAverageCost(
      [
        {
          type: 'BUY',
          symbol: 'ETH',
          quantity: new D('1'),
          price: new D('100'),
        },
        {
          type: 'BUY',
          symbol: 'ETH',
          quantity: new D('1'),
          price: new D('200'),
        },
        {
          type: 'SELL',
          symbol: 'ETH',
          quantity: new D('1'),
          price: new D('250'),
        },
      ],
      { ETH: 250 },
    );

    // avgCost після 2 buy: 300/2=150, sell 1 -> realized = 250-150=100
    expect(res.totals.realizedPnl.toString()).toBe('100');
    expect(res.positions[0].quantity.toString()).toBe('1');
    expect(res.positions[0].avgCost?.toString()).toBe('150');
  });

  it('oversell не ламає математику', () => {
    const res = calculatePositionsAverageCost(
      [
        {
          type: 'BUY',
          symbol: 'SOL',
          quantity: new D('1'),
          price: new D('10'),
        },
        {
          type: 'SELL',
          symbol: 'SOL',
          quantity: new D('5'),
          price: new D('20'),
        },
      ],
      { SOL: 20 },
    );

    expect(res.positions[0].quantity.toString()).toBe('0');
    expect(res.warnings?.oversold).toContain('SOL');
  });
});
