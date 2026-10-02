import { daysAgoISO } from './utils';

export type DateRange = 'today' | '7d' | '30d' | 'all';

export const DATE_RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'all', label: 'All time' },
];

export function rangeToFrom(range: DateRange): string | undefined {
  if (range === 'today') return daysAgoISO(0);
  if (range === '7d') return daysAgoISO(6);
  if (range === '30d') return daysAgoISO(29);
  return undefined;
}
