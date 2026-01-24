import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateTransactionDto {
  @IsString()
  portfolioId!: string;

  @IsString()
  assetSymbol!: string;

  @IsIn(['BUY', 'SELL'])
  type!: 'BUY' | 'SELL';

  @IsNumber()
  @Min(0)
  quantity!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsString()
  at?: string; // ISO, optional
}
