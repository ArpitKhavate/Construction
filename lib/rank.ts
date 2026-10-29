import type { AnchorFact, Constraints, Spot } from "@/lib/types";

const MIXED = new Set(["CS", "GR", "LR", "GO", "LO", "DMU", "CBD", "NO", "MU"]);
const INDUSTRIAL = new Set(["LI", "IP", "MI"]);

function floodHit(fact: AnchorFact) {
  return fact.fema.state === "hit" || fact.coaFlood.state === "hit";
}

function floodUnknown(fact: AnchorFact) {
  return fact.fema.state === "unknown" || fact.coaFlood.state === "unknown";
}

function bandFor(score: number): Spot["band"] {
  if (score >= 68) return "strong";
  if (score >= 48) return "possible";
  return "weak";
}

export function rankSpots(facts: AnchorFact[], constraints: Constraints): Spot[] {
  const ranked = facts.map((fact) => annotateSpot(fact, constraints));
  ranked.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const usable = ranked.filter((spot) => spot.band !== "weak");
  const shortlist = (usable.length ? usable : ranked).slice(0, 5);
  if (!constraints.avoidFlood) {
    const wet = ranked.find(
      (spot) =>
        (spot.fema.state === "hit" || spot.coaFlood.state === "hit") &&
        spot.band !== "weak" &&
        !shortlist.some((item) => item.id === spot.id),
    );
    if (wet) shortlist.push(wet);
  }
  return shortlist;
}

export function annotateSpot(fact: AnchorFact, constraints: Constraints): Spot {
  let score = 46;
  const reasons: string[] = [];
  let caution: string | null = null;
  const base = fact.zoningBase ?? "";
  const wet = floodHit(fact);
  const floodLabel = fact.fema.label ?? fact.coaFlood.label;

  if (constraints.avoidFlood && fact.fema.state === "clear" && fact.coaFlood.state === "clear") {
    score += 18;
    reasons.push("This point is outside the mapped FEMA and city floodplains.");
  } else if (constraints.avoidFlood && wet) {
    score -= 34;
    caution = `Mapped flood zone ${floodLabel ?? "present"}.`;
  } else if (wet) {
    score -= 8;
    reasons.push(`Mapped flood zone ${floodLabel}.`);
  } else if (floodUnknown(fact)) {
    score -= 4;
    reasons.push("A flood layer did not answer, so this spot is not treated as dry.");
  } else if (fact.fema.state === "clear" && fact.coaFlood.state === "clear") {
    reasons.push("Outside the mapped FEMA and city floodplains at this point.");
  }

  if (constraints.kind === "housing") {
    if (base === "SF") {
      score += 12;
      reasons.push("Single-family base district. A fit for a small residential project if the overlays agree.");
    } else if (base === "MF") {
      score += constraints.units && constraints.units > 4 ? 20 : 14;
      reasons.push("Multifamily base district.");
    } else if (base === "TOD") {
      score += 10;
      reasons.push("Transit-oriented district. A regulating plan controls the rules here.");
    } else if (MIXED.has(base)) {
      score += constraints.units && constraints.units > 4 ? 8 : 4;
      reasons.push("Commercial or mixed base district. Housing depends on the rest of the zoning string.");
    } else if (INDUSTRIAL.has(base)) {
      score -= 18;
      caution = "Industrial base district. A weak match for homes.";
    } else if (base === "PUD") {
      score -= 6;
      caution = "PUD. The standard district table does not control this tract.";
    }

    if (constraints.units && constraints.units > 4 && base === "SF") {
      score -= 34;
      caution = `You asked for ${constraints.units} homes on a single-family base district.`;
    }
    if (constraints.units && constraints.units <= 4 && (base === "SF" || base === "MF")) {
      score += 6;
    }
    if (constraints.fourplex && base === "SF") {
      reasons.push("A fourplex building uses the commercial review path even on a house-scale lot.");
    }
  } else if (MIXED.has(base) || base === "TOD" || base === "CBD") {
    score += 14;
    reasons.push("Commercial or mixed base district.");
  } else if (base === "SF" || base === "MF") {
    score -= 12;
    caution = "Residential base district for a commercial request.";
  }

  if (fact.zoning?.includes("NCCD")) {
    score -= 4;
    reasons.push("NCCD overlay. Local conservation rules can change the usual setbacks.");
  }

  const band = bandFor(score);
  return {
    ...fact,
    score,
    band,
    reasons: reasons.slice(0, 3),
    caution,
  };
}
