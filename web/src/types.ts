export type Urgency = 'expired' | 'today' | 'next3' | 'week' | 'later' | 'nodate';
export type DateType = 'DLC' | 'DDM' | 'EXP' | 'NONE';

/** Une ligne de stock : un lot, avec sa date et son emplacement propres. */
export type StockItem = {
  id: string;
  productId: string;
  name: string;
  brand: string | null;
  barcode: string | null;
  imageUrl: string | null;
  packageText: string | null;
  qty: number;
  unit: string;
  dateType: DateType;
  bestBefore: string | null;
  effectiveDate: string | null;
  dateFromOpening: boolean;
  daysLeft: number | null;
  urgency: Urgency;
  openedAt: string | null;
  frozenAt: string | null;
  thawedAt: string | null;
  daysAfterOpening: number | null;
  lotCode: string | null;
  status: 'active' | 'consumed' | 'trashed';
  isMedicine: boolean;
  dosage: string | null;
  medForm: string | null;
  notes: string | null;
  isFavorite: boolean;
  locationId: string | null;
  locationName: string;
  locationTone: string;
  locationKind: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryTone: string;
  createdAt: string;
};

export type Location = {
  id: string; name: string; tone: string; position: number; count: number;
  kind: 'frigo' | 'congelateur' | 'placard' | 'pharmacie' | 'autre';
};

export type Category = {
  id: string; name: string; tone: string; position: number; count: number; isMedicine: boolean;
};

export type Dashboard = {
  counts: Record<'total' | Urgency, number>;
  urgent: StockItem[];
  locations: { id: string; name: string; tone: string; kind: string; count: number }[];
  samples: Partial<Record<Urgency, string>>;
};

export type Movement = {
  id: string; kind: string; qtyDelta: number | null; label: string; at: string;
  productId: string | null; productName: string | null; from: string | null; to: string | null;
};

export type Lookup = {
  barcode: string;
  name: string | null;
  brand: string | null;
  imageUrl: string | null;
  packageText: string | null;
  categoryHint: string | null;
  source: 'stock' | 'cache' | 'off' | 'none';
  productId?: string;
};

export type DeviceSession = {
  id: string; name: string; lastSeenAt: string; createdAt: string; current: boolean;
};

export type RecentProduct = {
  id: string; name: string; brand: string | null; barcode: string | null; imageUrl: string | null;
  defaultUnit: string; categoryId: string | null; daysAfterOpening: number | null; isMedicine: boolean;
};

/** Brouillon du formulaire d'ajout, partagé entre le scan, l'OCR et la saisie. */
export type Draft = {
  productId?: string;
  batchId?: string;
  name: string;
  brand: string | null;
  barcode: string | null;
  imageUrl: string | null;
  packageText: string | null;
  categoryId: string | null;
  locationId: string | null;
  qty: number;
  unit: string;
  dateType: DateType;
  bestBefore: string | null;
  lotCode: string | null;
  daysAfterOpening: number | null;
  isMedicine: boolean;
  dosage: string | null;
  medForm: string | null;
  notes: string | null;
  /** Renseigné quand le code-barres a été reconnu : change le titre de l'écran. */
  recognizedFrom?: 'stock' | 'cache' | 'off';
};
