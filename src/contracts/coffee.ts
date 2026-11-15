export type CoffeeFormat = 'beans' | 'ground' | 'drip';
export type CoffeeUnit = 'tenth-gram' | 'piece';
export const brewMethods = [
  'espresso',
  'pour-over',
  'aeropress',
  'french-press',
  'cezve',
  'other',
  'drip',
] as const;
export type BrewMethod = (typeof brewMethods)[number];
export type CoffeeInput = {
  name: string;
  format: CoffeeFormat;
  initialQuantity: number;
  roaster?: string;
  country?: string;
  region?: string;
  processing?: string;
  tastingNotes?: string;
  note?: string;
  roastDate?: string | null;
  openedDate?: string | null;
  bestBefore?: string | null;
  dripWeight?: number | null;
  repeat?: boolean;
  setId?: string | null;
};
export type CoffeeItem = Required<Omit<CoffeeInput, 'dripWeight'>> & {
  id: string;
  unit: CoffeeUnit;
  remaining: number;
  dripWeight: number | null;
  archived: boolean;
  version: number;
  createdAt: string;
};
export type CoffeeSet = {
  id: string;
  name: string;
  roaster: string;
  note: string;
  archived: boolean;
  version: number;
  createdAt: string;
  items: CoffeeItem[];
  totals: { pieces: number; tenthGrams: number; finished: number };
};
export type BrewInput = {
  itemId: string;
  quantity: number;
  unit: CoffeeUnit;
  method: BrewMethod;
  occurredAt: string;
  rating?: number | null;
  note?: string;
};
export type Brew = Required<BrewInput> & {
  id: string;
  version: number;
  createdAt: string;
  itemName: string;
};
export type Adjustment = {
  kind: 'manual' | 'initial';
  id: string;
  itemId: string;
  delta: number;
  reason: string;
  createdAt: string;
};
export type CoffeeDetail = CoffeeItem & {
  adjustments: Adjustment[];
  hasHistory: boolean;
};
export type PageResult<T> = { items: T[]; total: number; page: number };
export type InventoryEntry =
  { kind: 'item'; item: CoffeeItem } | { kind: 'set'; set: CoffeeSet };
export function coffeeUnit(format: CoffeeFormat): CoffeeUnit {
  return format === 'drip' ? 'piece' : 'tenth-gram';
}
