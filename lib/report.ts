import { formatMoney } from "@/lib/constraints";
import { placeLabel } from "@/lib/gis";
import type {
  AgentStep,
  CallDraft,
  ChecklistItem,
  Constraints,
  FieldReport,
  LayerCheck,
  OutreachDraft,
  PermitHit,
  Spot,
} from "@/lib/types";

export const RESIDENTIAL =
  "https://www.austintexas.gov/development-services/residential-plan-review";
export const SITE_PLAN = "https://www.austintexas.gov/development-services/site-plan-requirements";
export const PROCESS =
  "https://www.austintexas.gov/development-services/understanding-development-process";
export const ABC = "https://www.austintexas.gov/development-services/austin-build-connect-abc";
export const ZONING_LAYER =
  "https://maps.austintexas.gov/arcgis/rest/services/Shared/Zoning_1/MapServer/0";
export const FLOOD_LAYER =
  "https://maps.austintexas.gov/arcgis/rest/services/Shared/Floodplain/MapServer";
export const PERMIT_LAYER =
  "https://maps.austintexas.gov/arcgis/rest/services/Shared/Permits/MapServer/0";

const TOKEN_NOTES: Record<string, string> = {
  "SF-1": "Single-family residence, large lot.",
  "SF-2": "Single-family residence, standard lot.",
  "SF-3": "Family residence. This is Austin's common single-family base district.",
  "SF-4A": "Single-family residence, small lot.",
  "SF-4B": "Single-family residence, condominium site.",
  "SF-5": "Urban family residence.",
  "SF-6": "Townhouse and condominium.",
  "MF-1": "Multifamily base district.",
  "MF-2": "Multifamily base district.",
  "MF-3": "Multifamily base district.",
  "MF-4": "Multifamily base district.",
  "MF-5": "Multifamily base district.",
  "MF-6": "Multifamily base district.",
  NO: "Neighborhood office.",
  LO: "Limited office.",
  GO: "General office.",
  LR: "Neighborhood commercial.",
  GR: "Community commercial.",
  CS: "General commercial services.",
  "CS-1": "Commercial, with liquor sales called out in the code.",
  CH: "Commercial highway.",
  CBD: "Central business district.",
  DMU: "Downtown mixed use.",
  LI: "Limited industrial.",
  IP: "Industrial park.",
  MI: "Major industrial.",
  TOD: "Transit-oriented development. A regulating plan controls this district.",
  PUD: "Planned unit development. Rules come from that project's ordinance.",
  NP: "Neighborhood plan combining district.",
  NCCD: "Neighborhood conservation combining district. Local rules can change setbacks and uses.",
  H: "Historic landmark combining district.",
  HD: "Historic area combining district.",
  V: "Vertical mixed use combining district.",
  ETOD: "Equitable transit-oriented development overlay.",
  DBETOD: "Density bonus tied to the ETOD overlay.",
  CO: "Conditional overlay. Extra conditions are attached to this tract.",
  MU: "Mixed use combining district.",
};

export function zoningTokens(ztype: string): string[] {
  const parts = ztype.split("-").filter(Boolean);
  const tokens: string[] = [];
  for (let i = 0; i < parts.length; i += 1) {
    const current = parts[i];
    const upcoming = parts[i + 1];
    if (/^(SF|MF|CS|LI)$/.test(current) && upcoming && /^\d+[A-Z]?$/.test(upcoming)) {
      tokens.push(`${current}-${upcoming}`);
      i += 1;
      continue;
    }
    tokens.push(current);
  }
  return tokens;
}

function hit(check: LayerCheck) {
  return check.state === "hit";
}

function floodSentence(field: FieldReport) {
  if (hit(field.fema) || hit(field.coaFlood)) {
    const parts = [
      hit(field.fema) ? `FEMA ${field.fema.label ?? "flood zone"}` : null,
      hit(field.coaFlood) ? field.coaFlood.label : null,
    ].filter((part): part is string => Boolean(part));
    return `The map point intersects ${parts.join(" and ")}.`;
  }
  if (hit(field.nearFlood)) return "A mapped FEMA flood zone is within about 100 feet.";
  if (field.fema.state === "unknown" || field.coaFlood.state === "unknown") {
    return "The flood layer did not answer for this point.";
  }
  return "The map point is outside the mapped FEMA and city floodplains. The rest of the parcel still needs a survey.";
}

function permitLine(permit: PermitHit) {
  const bits = [permit.year, permit.type, permit.status, permit.address].filter(Boolean);
  if (permit.units) bits.push(`${permit.units} ${permit.units === 1 ? "unit" : "units"}`);
  return bits.join(" · ");
}

// "4 active building permits" style count for prose; the full rows stay on the Permits card.
function permitSummary(permits: PermitHit[]) {
  const count = permits.length;
  const statuses = new Set(permits.map((permit) => permit.status?.toLowerCase()).filter(Boolean));
  const status = statuses.size === 1 ? `${[...statuses][0]} ` : "";
  return `${count} ${status}building ${count === 1 ? "permit" : "permits"}`;
}

export function buildChecklist(constraints: Constraints, field: FieldReport): ChecklistItem[] {
  const items: Omit<ChecklistItem, "n">[] = [];
  const zoning = field.zoning;
  const tokens = zoning ? zoningTokens(zoning) : [];
  const pud = field.zoningBase === "PUD" || tokens.includes("PUD");
  const nccd = tokens.includes("NCCD");

  items.push({
    title: pud ? "Read the PUD ordinance before the standard checklist" : "Confirm the zoning on this exact lot",
    detail: zoning
      ? `The city zoning layer returned ${zoning}${field.zoningBase ? ` (base ${field.zoningBase})` : ""} at this map point.${
          nccd ? " The NCCD token means a neighborhood conservation district can change the usual rules." : ""
        } ${
          pud
            ? "A PUD follows its own ordinance. The residential four-unit path below may not apply until you read that ordinance."
            : "Overlays in that string can change what the base district allows. Match the point to the parcel in the city's property profile before you design."
        }`
      : "The zoning layer returned no district at this point. Look the parcel up before you treat any checklist step as applicable.",
    why: "Designing a building the district does not allow is the expensive early mistake.",
    href: PROCESS,
    hrefLabel: "Austin development process",
  });

  items.push({
    title: "Check the deed restrictions yourself",
    detail:
      "City zoning does not cancel a private covenant. A lot can show a district that allows more than one home and still be limited to one house by the deed.",
    why: "Austin Development Services says deed restrictions are the applicant's job to verify.",
    href: RESIDENTIAL,
    hrefLabel: "Residential plan review",
  });

  items.push({
    title: "Confirm the tract is a legal lot",
    detail:
      "If the land was never platted, or it is not a legal lot, the city requires a subdivision application or a land status determination before the building permit can move.",
    why: "Permit review assumes the lot itself is legal. Finding out late restarts the clock.",
    href: RESIDENTIAL,
    hrefLabel: "Residential plan review",
  });

  items.push(pathItem(constraints, pud));

  if (hit(field.fema) || hit(field.coaFlood) || hit(field.nearFlood)) {
    items.push({
      title: "Add a floodplain review",
      detail: `${floodSentence(field)} Residential review requires a floodplain review inside the City of Austin 100-year floodplain, or within 100 feet of it.`,
      why: "Flood review sets the floor elevation, and it can stop a design that ignores the water.",
      href: RESIDENTIAL,
      hrefLabel: "Floodplain proximity rule",
    });
  } else if (field.fema.state === "unknown" || field.coaFlood.state === "unknown") {
    items.push({
      title: "Check the floodplain before you rely on this list",
      detail: "The city flood layer did not answer for this point. Open the floodplain map and ask the surveyor to confirm the 100-year floodplain and the 100-foot boundary.",
      why: "A missing flood read is not a dry lot.",
      href: FLOOD_LAYER,
      hrefLabel: "City floodplain layer",
    });
  } else {
    items.push({
      title: "Have the surveyor confirm the floodplain anyway",
      detail:
        "This map point is outside the FEMA floodplain and the city's fully developed floodplain. That check is a point, not the whole parcel. The 100-foot boundary rule still applies.",
      why: "The front of a lot can be dry while the back is in the floodplain.",
      href: RESIDENTIAL,
      hrefLabel: "Floodplain proximity rule",
    });
  }

  items.push({
    title: "See if Subchapter F applies",
    detail:
      "Subchapter F limits height, floor area, and building mass in older Austin neighborhoods. If the property profile shows it, you need a setback-plane plan sealed by a surveyor, and extra exhibits once the building is over 20 feet or one story.",
    why: "This is a common first rejection on house-scale projects, and it changes the drawing set.",
    href: RESIDENTIAL,
    hrefLabel: "Subchapter F notes",
  });

  if (hit(field.creek)) {
    items.push({
      title: "Plan for an erosion hazard zone review",
      detail:
        "A creek centerline is within about 100 feet of this point. Residential review asks for an erosion hazard zone review when the property is within 100 feet of a creek or stream bed.",
      why: "Building next to a creek without that review gets the application sent back.",
      href: RESIDENTIAL,
      hrefLabel: "Erosion hazard zone",
    });
  }

  if (hit(field.wui)) {
    items.push({
      title: "Add the wildland-urban interface fire review",
      detail: "This point falls in the city's wildland-urban interface layer. Residential review sends those projects to fire review.",
      why: "Fire review changes materials and defensible space before the permit is issued.",
      href: RESIDENTIAL,
      hrefLabel: "Additional reviews",
    });
  }

  if (hit(field.pipeline)) {
    items.push({
      title: "Add a fire review for the hazardous pipeline",
      detail:
        "The hazardous-pipeline layer hits within about 200 feet. Residential review requires fire review when a property is within 200 feet of a hazardous pipeline.",
      why: "The pipeline buffer is a safety review, and it is separate from zoning.",
      href: RESIDENTIAL,
      hrefLabel: "Additional reviews",
    });
  }

  if (hit(field.airport)) {
    items.push({
      title: "Check Austin Aviation before you set a height",
      detail:
        "This point intersects an airport overlay. Aviation review applies in the overlay zones, and a structure at or above 200 feet also goes to the FAA on Form 7460-1. The city publishes AviationLandUse@FlyAustin.com and 512-530-6622 for this question.",
      why: "Height that is fine under zoning can still be an airspace problem near the airport.",
      href: RESIDENTIAL,
      hrefLabel: "Austin Aviation review",
    });
  }

  if (hit(field.historic) || tokens.includes("H") || tokens.includes("HD")) {
    items.push({
      title: "Start the historic review early",
      detail: hit(field.historic)
        ? "This point intersects a local historic district. Exterior demolition or changes on a landmark, an H zoning, an HD zoning, or a building 45 years or older also trigger historic review."
        : "The zoning string includes a historic token. Exterior work and any building 45 years or older need a historic check before you demolish or restyle the front.",
      why: "Historic comments arrive late when the drawings are already finished.",
      href: RESIDENTIAL,
      hrefLabel: "Historic applicability",
    });
  }

  items.push({
    title: "Look up old permits on this block",
    detail: field.permits.length
      ? `${permitSummary(field.permits)} within about 220 meters (listed under Permits). Search this address in Austin Build + Connect. An expired permit has to be acknowledged with the new application.`
      : "No building-permit points came back within about 220 meters. Search the address in Austin Build + Connect anyway, and file the expired-permit acknowledgment if one is still open.",
    why: "An expired permit on the property can stall a new application.",
    href: ABC,
    hrefLabel: "Austin Build + Connect",
  });

  items.push({
    title: "Prepare the drawings, apply, and pay the invoice",
    detail:
      constraints.kind === "commercial" || constraints.fourplex || (constraints.units ?? 0) > 4
        ? "Use the application that matches the path above, and follow that desk's exhibit list. Review time does not start when you email a question. It starts after the city accepts the application and you pay the invoice."
        : "Use the residential new-construction application and the exhibit list in the Building Criteria Manual. The city publishes 10 business days for new construction and additions once the application is accepted and the invoice is paid. As of October 2026, Austin Energy no longer requires the Building Service Planning Application on residential permit applications.",
    why: "The review clock starts after payment, so an unpaid draft is not in line.",
    href: constraints.fourplex || (constraints.units ?? 0) > 4 || constraints.kind === "commercial" ? SITE_PLAN : RESIDENTIAL,
    hrefLabel: "Application notes",
  });

  items.push({
    title: "Have the contractor activate the permit, then inspect",
    detail:
      "After the last reviewer approves the set, the city emails that the permits are pending activation. A registered contractor activates them. Construction starts after activation and the first scheduled inspection.",
    why: "An approved plan is not permission to start work.",
    href: PROCESS,
    hrefLabel: "Permits and inspections",
  });

  return items.map((item, index) => ({ ...item, n: index + 1 }));
}

function pathItem(constraints: Constraints, pud: boolean): Omit<ChecklistItem, "n"> {
  if (constraints.kind === "commercial") {
    return {
      title: "Start this as a commercial project",
      detail:
        "The request is commercial, so the residential four-unit path does not apply. Begin with the site plan requirements and the commercial review desk that matches the use.",
      why: "A residential application for a shop or office goes to the wrong reviewers.",
      href: SITE_PLAN,
      hrefLabel: "Site plan requirements",
    };
  }
  if (constraints.fourplex) {
    return {
      title: "File a fourplex with Commercial Plan Review",
      detail:
        "Austin defines a fourplex as one building with four dwellings, each with its own entrance, kitchen, and bathroom. That is not a four-unit townhouse. The city says a fourplex goes to Commercial Plan Review. The residential page tells you how to begin that application.",
      why: "The residential web form is the wrong door for a fourplex building, and it costs a review cycle.",
      href: RESIDENTIAL,
      hrefLabel: "Fourplex projects",
    };
  }
  if (constraints.units != null && constraints.units > 4) {
    return {
      title: "Plan on a site plan",
      detail: `You asked for ${constraints.units} homes. Austin's published residential site-plan exemption covers four-unit developments. Above that, start with the site plan requirements and expect drainage, parking, utilities, and environmental review before the building permit.${
        pud ? " The PUD ordinance can change this." : ""
      }`,
      why: "Site plan is where the city checks how the building sits on the land, before it checks the structure.",
      href: SITE_PLAN,
      hrefLabel: "Site plan requirements",
    };
  }
  if (constraints.units != null && constraints.units <= 4) {
    return {
      title: "File one residential building permit for every unit",
      detail: `You asked for ${constraints.units} ${constraints.units === 1 ? "home" : "homes"}. Four-unit developments are exempt from site plan and are classified as multi-family residential. Residential Plan Review still covers up to four separate houses, a three-unit building plus one detached house, two duplexes, and a four-unit townhouse. Submit one residential building permit application that includes every unit.${
        constraints.adu ? " You also mentioned an accessory dwelling. Confirm the current accessory-dwelling rules for this district before you count it as allowed." : ""
      } A single fourplex building is the exception and goes to commercial review.`,
      why: "This is the short path for a small housing project. Splitting the homes into separate applications adds reviews without changing the building.",
      href: RESIDENTIAL,
      hrefLabel: "Four-unit development projects",
    };
  }
  return {
    title: "Set the unit count before you file",
    detail:
      "The door you walk through changes at four homes. Four or fewer can use Residential Plan Review, with a fourplex building as the commercial exception. Five or more should start at site plan. Say the number in the feedback box and this list will be rewritten.",
    why: "Every later step depends on this number.",
    href: RESIDENTIAL,
    hrefLabel: "Residential plan review",
  };
}

export function buildSteps(
  spot: Spot,
  field: FieldReport,
  constraints: Constraints,
  timings: Record<string, number>,
): AgentStep[] {
  const place = placeLabel(field.address, spot.name);
  const tokens = field.zoning ? zoningTokens(field.zoning) : [];
  const tokenLines = tokens.map((token) => {
    const note = TOKEN_NOTES[token];
    return note ? `${token}: ${note}` : `${token}: this token is on the zoning string. Read it in the ordinance before you treat it as permission.`;
  });

  const codes: AgentStep = {
    id: "codes",
    title: "Codes",
    status: field.zoning ? "done" : "gap",
    durationMs: timings.codes ?? 0,
    summary: field.zoning
      ? `${place} returns ${field.zoning} on the city zoning layer.`
      : `The zoning layer returned no district for ${place}.`,
    bullets: field.zoning
      ? [
          ...tokenLines.slice(0, 6),
          "This is the district at the map point. It is not a zoning determination or a statement that your unit count is allowed.",
        ]
      : ["Look the parcel up in the city property profile before using the rest of this research."],
    sources: [
      { label: "Zoning layer", url: ZONING_LAYER },
      { label: "Development process", url: PROCESS },
    ],
  };

  const hazardBullets: string[] = [floodSentence(field)];
  if (hit(field.pipeline)) hazardBullets.push("Hazardous pipeline layer: within about 200 feet.");
  else if (field.pipeline.state === "clear") hazardBullets.push("No hazardous-pipeline hit within about 200 feet.");
  else hazardBullets.push("The pipeline layer did not answer.");
  if (hit(field.wui)) hazardBullets.push("The point is inside the wildland-urban interface.");
  else if (field.wui.state === "clear") hazardBullets.push("No wildland-urban interface hit at this point.");
  if (hit(field.airport)) hazardBullets.push("The point intersects an airport overlay.");
  else if (field.airport.state === "clear") hazardBullets.push("No airport-overlay hit at this point.");

  const hazards: AgentStep = {
    id: "hazards",
    title: "Hazards",
    status:
      field.fema.state === "unknown" || field.pipeline.state === "unknown" || field.wui.state === "unknown"
        ? "gap"
        : "done",
    durationMs: timings.hazards ?? 0,
    summary: hit(field.fema) || hit(field.coaFlood) || hit(field.pipeline) || hit(field.wui) || hit(field.airport)
      ? "At least one safety layer intersects this point."
      : "The safety layers that answered did not intersect this point.",
    bullets: hazardBullets,
    sources: [
      { label: "Floodplain layers", url: FLOOD_LAYER },
      { label: "Residential additional reviews", url: RESIDENTIAL },
    ],
  };

  const permits: AgentStep = {
    id: "permits",
    title: "Permits",
    status: "done",
    durationMs: timings.permits ?? 0,
    summary: field.permits.length
      ? `${field.permits.length} building-permit points sit within about 220 meters.`
      : "No building-permit points came back within about 220 meters.",
    bullets: field.permits.length
      ? field.permits.map((permit) => permitLine(permit) || "Permit record")
      : ["Search the address in Austin Build + Connect. A quiet block on this layer is not a permit history."],
    sources: [
      { label: "Building permits layer", url: PERMIT_LAYER },
      { label: "Austin Build + Connect", url: ABC },
    ],
  };

  const path = pathItem(constraints, field.zoningBase === "PUD" || tokens.includes("PUD"));
  const budgetLine = constraints.budget
    ? `You mentioned a budget of ${formatMoney(constraints.budget)}. This research has no sale price for the spot, so the budget is noted and not scored.`
    : "This pass has no sale price. It reads city maps, then tells you the next filing step.";

  const development: AgentStep = {
    id: "development",
    title: "Development help",
    status: "done",
    durationMs: timings.development ?? 0,
    summary: path.title,
    bullets: [path.detail, budgetLine, "The email and the call below stay as drafts until you approve them. Nothing is filed with the city."],
    sources: [{ label: path.hrefLabel ?? "City process", url: path.href ?? RESIDENTIAL }],
  };

  const envBullets = [
    floodSentence(field),
    hit(field.creek)
      ? "A mapped creek centerline is within about 100 feet, which is the erosion hazard zone distance on the residential page."
      : field.creek.state === "clear"
        ? "No creek centerline within about 100 feet of this point."
        : "The creek layer did not answer.",
    "Protected trees and critical water quality zones are not in this pass. A site walk still has to cover them.",
  ];

  const environmental: AgentStep = {
    id: "environmental",
    title: "Environmental",
    status: field.creek.state === "unknown" || field.fema.state === "unknown" ? "gap" : "done",
    durationMs: timings.environmental ?? 0,
    summary: hit(field.creek) || hit(field.fema) || hit(field.coaFlood)
      ? "Water and creek layers need attention at this point."
      : "The water layers that answered are clear at this point.",
    bullets: envBullets,
    sources: [
      { label: "Floodplain layers", url: FLOOD_LAYER },
      { label: "Erosion hazard zone", url: RESIDENTIAL },
    ],
  };

  return [codes, hazards, permits, development, environmental];
}

export function buildEmail(spot: Spot, field: FieldReport, constraints: Constraints): OutreachDraft {
  const place = placeLabel(field.address, spot.name);
  const homes = constraints.fourplex
    ? "a fourplex"
    : constraints.units
      ? `${constraints.units} ${constraints.units === 1 ? "home" : "homes"}`
      : "a small residential project";
  return {
    to: process.env.DEMO_EMAIL ?? "",
    subject: `Austin site question: ${place}`,
    status: "draft",
    body: [
      "Hello,",
      "",
      `I am looking at ${place} in the ${spot.name} area for ${homes}.`,
      field.zoning ? `City zoning at the map point is ${field.zoning}.` : "City zoning did not return a district at the map point.",
      floodSentence(field),
      "I have a beginner permit checklist taken from Austin Development Services and I want a second set of eyes before anything is filed.",
      "Would you be willing to look at the site with me?",
      "",
      "Thank you",
    ].join("\n"),
  };
}

export function buildCall(spot: Spot, field: FieldReport, constraints: Constraints): CallDraft {
  const place = placeLabel(field.address, spot.name);
  const homes = constraints.fourplex
    ? "a fourplex"
    : constraints.units
      ? `${constraints.units} homes`
      : "a residential project";
  const script = `Hello. This is a call about ${homes} in Austin, near ${place}. City zoning at the map point is ${field.zoning ?? "not returned"}. ${floodSentence(field)} I would like to review the permit path before anything is filed. If you are open to it, please call me back.`;
  return {
    to: process.env.DEMO_PHONE ?? "",
    script,
    status: "draft",
  };
}
