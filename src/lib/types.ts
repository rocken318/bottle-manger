export type Role = 'master' | 'admin' | 'staff';
export type MovementType = 'receive' | 'sale' | 'transfer' | 'adjust' | 'dispose';
/** Why bottles were disposed of (破損・廃棄). */
export type DisposeReason = 'breakage' | 'tasting' | 'expired' | 'other';

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

/** 酒の種類（焼酎・ウイスキー…）。管理画面から追加・改名・廃止できる。 */
export interface Category {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export interface Drink {
  id: string;
  name: string;
  unitsPerCase: number;
  isActive: boolean;
  createdAt: Date;
  /** null は「未分類」。カテゴリを廃止したボトルもここに落ちる。 */
  categoryId: string | null;
  categoryName: string | null;
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
  /** Only for dispose. */
  reason?: DisposeReason | null;
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
  reason: DisposeReason | null;
  note: string | null;
  /** Photos attached to the movement's batch. */
  photoIds: string[];
  staffId: string;
  staffName: string;
  createdAt: Date;
  voidedAt: Date | null;
  voidedByName: string | null;
}

/** お客様のキープボトル。日付は YYYY-MM-DD の文字列（日本の暦日）。 */
export interface KeepBottle {
  id: string;
  customerName: string;
  drinkId: string;
  /** 登録時点のお酒の名前。drinks 側を直しても変わらない。 */
  drinkName: string;
  registeredOn: string;
  lastUsedOn: string;
  status: 'active' | 'dropped';
  droppedOn: string | null;
  note: string;
  createdAt: Date;
}
