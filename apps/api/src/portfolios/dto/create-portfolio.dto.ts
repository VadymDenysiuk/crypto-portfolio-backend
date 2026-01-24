import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreatePortfolioDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  baseCurrency?: string; // default "USD" in DB anyway
}
