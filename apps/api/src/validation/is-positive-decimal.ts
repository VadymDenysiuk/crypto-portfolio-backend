import Decimal from 'decimal.js';
import {
  ValidateBy,
  buildMessage,
  type ValidationOptions,
} from 'class-validator';

function parseDecimal(value: unknown): Decimal | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return new Decimal(value);
  }
  if (typeof value === 'string') {
    const s = value.trim().replace(',', '.');
    if (!s) return null;
    try {
      return new Decimal(s);
    } catch {
      return null;
    }
  }
  return null;
}

export const IsPositiveDecimal: (
  options?: ValidationOptions,
) => PropertyDecorator = (options) =>
  ValidateBy(
    {
      name: 'isPositiveDecimal',
      validator: {
        validate(value: unknown) {
          const d = parseDecimal(value);
          return d !== null && d.gt(0);
        },
        defaultMessage: buildMessage(
          (eachPrefix) => `${eachPrefix}$property must be a positive decimal`,
          options,
        ),
      },
    },
    options,
  );
