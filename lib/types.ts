export type LayerCheck = {
  state: "hit" | "clear" | "unknown";
  label: string | null;
  detail: string | null;
};

export type PermitHit = {
  year: string | null;
  type: string | null;
  status: string | null;
  address: string | null;
  units: number | null;
  number: string | null;
  work: string | null;
  link: string | null;
};

export type Constraints = {
  units: number | null;
  avoidFlood: boolean;
  budget: number | null;
  kind: "housing" | "commercial";
  fourplex: boolean;
  adu: boolean;
  notes: string[];
};

export type AnchorFact = {
  id: string;
  name: string;
  lng: number;
  lat: number;
  address: string | null;
  zoning: string | null;
  zoningBase: string | null;
  fema: LayerCheck;
  coaFlood: LayerCheck;
};

export type Spot = AnchorFact & {
  score: number;
  band: "strong" | "possible" | "weak";
  reasons: string[];
  caution: string | null;
};

export type FieldReport = {
  zoning: string | null;
  zoningBase: string | null;
  address: string | null;
  fema: LayerCheck;
  coaFlood: LayerCheck;
  nearFlood: LayerCheck;
  permits: PermitHit[];
  wui: LayerCheck;
  pipeline: LayerCheck;
  airport: LayerCheck;
  creek: LayerCheck;
  historic: LayerCheck;
};

export type AgentId = "codes" | "hazards" | "permits" | "development" | "environmental";

export type SourceLink = { label: string; url: string };

export type AgentStep = {
  id: AgentId;
  title: string;
  status: "done" | "gap";
  summary: string;
  bullets: string[];
  sources: SourceLink[];
  durationMs: number;
};

export type ChecklistItem = {
  n: number;
  title: string;
  detail: string;
  why: string;
  href?: string;
  hrefLabel?: string;
};

export type OutreachDraft = {
  to: string;
  subject: string;
  body: string;
  status: "draft" | "sent" | "failed";
  error?: string;
  providerId?: string;
};

export type CallDraft = {
  to: string;
  script: string;
  status: "draft" | "placed" | "failed";
  error?: string;
  providerId?: string;
};

export type RenderResult = {
  before: string;
  after: string;
  changes: { step: string; note: string }[];
};

export type Revision = {
  note: string;
  fromName: string;
  toName: string;
  moved: boolean;
};

export type PermitField = {
  label: string;
  value: string;
  tone: "filled" | "blank" | "yes" | "no";
};

export type PermitSection = {
  title: string;
  fields: PermitField[];
};

export type PermitForm = {
  id: string;
  title: string;
  sourceLabel: string;
  sourceUrl: string;
  fileName: string;
  intro: string;
  sections: PermitSection[];
};

export type PermitPacket = {
  filledAt: string;
  clerkNote: string;
  forms: PermitForm[];
};

export type RunRecord = {
  id: string;
  prompt: string;
  constraints: Constraints;
  spot: Spot;
  field: FieldReport;
  steps: AgentStep[];
  checklist: ChecklistItem[];
  email: OutreachDraft;
  call: CallDraft;
  render: RenderResult | null;
  permitsPacket: PermitPacket | null;
  revision: Revision | null;
  feedback: string[];
  durationMs: number;
  createdAt: string;
  updatedAt: string;
};
