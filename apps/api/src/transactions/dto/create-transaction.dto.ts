import { IsIn, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { IsPositiveDecimal } from '../../validation/is-positive-decimal';

function normalizeDecimal(v: unknown): string {
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  if (typeof v === 'string') return v.trim().replace(',', '.');
  return '';
}

export class CreateTransactionDto {
  @IsString()
  portfolioId!: string;

  @IsString()
  assetSymbol!: string;

  @IsIn(['BUY', 'SELL'])
  type!: 'BUY' | 'SELL';

  @Transform(({ value }) => normalizeDecimal(value))
  @IsString()
  @IsPositiveDecimal({ message: 'quantity must be > 0' })
  quantity!: string;

  @IsOptional()
  @Transform(({ value }) => normalizeDecimal(value))
  @IsString()
  @IsPositiveDecimal({ message: 'price must be > 0' })
  price?: string;

  @IsOptional()
  @IsString()
  at?: string;
}
