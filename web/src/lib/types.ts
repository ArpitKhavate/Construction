export type Finding = {
  claim: string;
  quote?: string;
  source_url: string;
  source_title: string;
  retrieved_at: string;
};

export type Section = {
  key: "zoning" | "permits" | "hazards" | "cost" | string;
  title: string;
  findings: Finding[];
};

export type ChecklistItem = {
  step: number;
  action: string;
  who: string;
  phone?: string;
  email?: string;
  url?: string;
};

export type Contact = {
  name: string;
  category?: string;
  phone?: string;
  website?: string;
  rating?: number;
  reviews?: number;
  address?: string;
};

export type Parcel = {
  id: string;
  address: string;
  lat: number | null;
  lng: number | null;
  zone_code: string | null;
  lot_sqft: number | null;
};

export type Report = {
  id: string;
  parcel_id: string;
  idea: string;
  status: string;
  summary: string | null;
  scores: Record<string, number> | null;
  sections: Section[] | null;
  checklist: ChecklistItem[] | null;
  contacts: Contact[] | null;
  created_at: string;
  parcels?: Parcel;
};
