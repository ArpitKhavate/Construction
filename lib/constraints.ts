import type { Constraints } from "@/lib/types";

const EMPTY: Constraints = {
  units: null,
  avoidFlood: false,
  budget: null,
  kind: "housing",
  fourplex: false,
  adu: false,
  notes: [],
};

export function parseConstraints(text: string, prior: Constraints = EMPTY): Constraints {
  const source = text.toLowerCase();
  const next: Constraints = { ...prior, notes: [...prior.notes] };

  const numbered = source.match(/\b(\d+)\s*[- ]?(unit|apartment|home|house|plex|dwelling)s?\b/);
  if (numbered) next.units = Number(numbered[1]);
  const only = source.match(/\bonly\s+(\d+)\b/);
  if (only) next.units = Number(only[1]);
  if (/\bduplex\b/.test(source)) next.units = next.units ?? 2;
  if (/\btriplex\b/.test(source)) next.units = 3;
  if (/\bfourplex\b|\b4-plex\b|\bfour-plex\b/.test(source)) {
    next.units = 4;
    next.fourplex = true;
  }
  if (/\btownhome|\btownhouse\b/.test(source)) next.fourplex = false;
  if (/\badu\b|accessory dwelling/.test(source)) next.adu = true;

  const money = source.match(/\$\s*([\d,.]+)\s*(m|million|k)?/i);
  if (money) {
    let amount = Number(money[1].replace(/,/g, ""));
    const suffix = money[2]?.toLowerCase();
    if (suffix === "m" || suffix === "million") amount *= 1_000_000;
    if (suffix === "k") amount *= 1000;
    if (Number.isFinite(amount)) next.budget = amount;
  }

  if (/flood(plain)? is (ok|fine|acceptable)|ignore flood/.test(source)) next.avoidFlood = false;
  else if (/flood/.test(source) && /avoid|outside|away from|no |dry lot|not in/.test(source)) next.avoidFlood = true;

  const commercial = /retail|office|shop|warehouse|commercial/.test(source);
  const housing = /home|house|unit|apartment|duplex|housing|residential|family|adu|townhome|townhouse|fourplex/.test(source);
  if (commercial && !housing) next.kind = "commercial";
  if (housing) next.kind = "housing";

  return next;
}

export function applyFeedback(current: Constraints, text: string): Constraints {
  const next = parseConstraints(text, current);
  const source = text.toLowerCase();
  if (/fewer|smaller|one less|less units/.test(source) && !/\d/.test(source)) {
    next.units = Math.max(1, (current.units ?? 4) - 1);
  }
  if (/more units|one more|add a unit/.test(source) && !/\d/.test(source)) {
    next.units = (current.units ?? 1) + 1;
  }
  next.notes = [...current.notes, text.trim()];
  return next;
}

export function constraintsChanged(before: Constraints, after: Constraints) {
  return (
    before.units !== after.units ||
    before.avoidFlood !== after.avoidFlood ||
    before.kind !== after.kind ||
    before.fourplex !== after.fourplex ||
    before.adu !== after.adu ||
    before.budget !== after.budget
  );
}

export function constraintChips(constraints: Constraints): string[] {
  const chips: string[] = [];
  if (constraints.fourplex) chips.push("Fourplex");
  else if (constraints.units) chips.push(`${constraints.units} ${constraints.units === 1 ? "home" : "homes"}`);
  else chips.push("Unit count not set");
  if (constraints.adu) chips.push("Accessory dwelling");
  if (constraints.kind === "commercial") chips.push("Commercial");
  if (constraints.avoidFlood) chips.push("Avoid floodplain");
  if (constraints.budget) chips.push(`Budget ${formatMoney(constraints.budget)}`);
  return chips;
}

export function formatMoney(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}
