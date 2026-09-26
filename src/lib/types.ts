export type Role = 'admin' | 'staff';
export type MovementType = 'receive' | 'sale' | 'transfer' | 'adjust';

export interface Location {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export interface Staff {
  id: string;
  name: string;
  role: Role;
  homeLocationId: string | null;
  isActive: boolean;
  failedPinAttempts: number;
  lockedUntil: Date | null;
}

export interface Drink {
  id: string;
  name: string;
  unitsPerCase: number;
  isActive: boolean;
  createdAt: Date;
}

export interface StockLevel {
  locationId: string;
  drinkId: string;
  quantity: number;
}

/** A validated movement ready to be sent to apply_movements. For 'adjust', quantity is ignored (computed in SQL). */
export interface MovementInput {
  type: MovementType;
  drinkId: string;
  fromLocationId: string | null;
  toLocationId: string | null;
  quantity: number;
  countedQuantity: number | null;
  note: string | null;
}

export interface Movement {
  id: string;
  batchId: string;
  type: MovementType;
  drinkId: string;
  drinkName: string;
  unitsPerCase: number;
  fromLocationId: string | null;
  fromLocationName: string | null;
  toLocationId: string | null;
  toLocationName: string | null;
  quantity: number;
  countedQuantity: number | null;
  note: string | null;
  staffId: string;
  staffName: string;
  createdAt: Date;
  voidedAt: Date | null;
  voidedByName: string | null;
}
