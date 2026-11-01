import { Input } from '@/components/ui';

import { formatDate, isValidIsoDate } from '../format';

export interface DateFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

/** Plain YYYY-MM-DD text field (no native date-picker dependency). Digits get dashes inserted. */
export function DateField({ label, value, onChange, error }: DateFieldProps) {
  const handle = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 8);
    const parts = [digits.slice(0, 4), digits.slice(4, 6), digits.slice(6, 8)].filter(Boolean);
    onChange(parts.join('-'));
  };
  return (
    <Input
      label={label}
      value={value}
      onChangeText={handle}
      placeholder="YYYY-MM-DD"
      keyboardType="number-pad"
      maxLength={10}
      error={error}
      hint={isValidIsoDate(value) ? formatDate(value) : 'Year-month-day, e.g. 2026-12-15'}
    />
  );
}
