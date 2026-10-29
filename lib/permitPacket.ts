import { RESIDENTIAL, SITE_PLAN, zoningTokens } from "@/lib/report";
import type { LayerCheck, PermitField, PermitForm, PermitPacket, RunRecord } from "@/lib/types";

const FORM_URL = "https://services.austintexas.gov/edims/document.cfm?id=422972";

function field(label: string, value: string, tone: PermitField["tone"] = "filled"): PermitField {
  return { label, value, tone };
}

function review(label: string, value: "Yes" | "No" | "Not checked", note?: string): PermitField {
  const tone = value === "Yes" ? "yes" : value === "No" ? "no" : "blank";
  return field(label, note ? `${value}. ${note}` : value, tone);
}

function fromLayers(checks: LayerCheck[]): "Yes" | "No" | "Not checked" {
  if (checks.some((check) => check.state === "hit")) return "Yes";
  if (checks.some((check) => check.state === "unknown")) return "Not checked";
  return "No";
}

function proposedUse(run: RunRecord) {
  if (run.constraints.fourplex) return "Other: fourplex, one building with four dwellings";
  const units = run.constraints.units;
  if (units === 1) return "Single-family residential";
  if (units === 2) return "Duplex residential";
  if (units === 3) return "Other: three dwellings";
  if (units === 4) return "Other: four-unit residential development";
  if (units && units > 4) return `Other: ${units} dwellings`;
  return "Not set. Enter the unit count before filing.";
}

function workDescription(run: RunRecord, place: string) {
  const units = run.constraints.fourplex
    ? "a fourplex"
    : run.constraints.units
      ? `${run.constraints.units} ${run.constraints.units === 1 ? "dwelling" : "dwellings"}`
      : "a residential project";
  const zoning = run.field.zoning ? `Zoning at the map point is ${run.field.zoning}.` : "Zoning did not return for this map point.";
  const flood =
    fromLayers([run.field.fema, run.field.coaFlood, run.field.nearFlood]) === "Yes"
      ? "A mapped floodplain is at this point or within about 100 feet."
      : fromLayers([run.field.fema, run.field.coaFlood]) === "No"
        ? "This map point is outside the mapped FEMA and city floodplains. The parcel still needs a survey."
        : "The flood layers did not fully answer.";
  return `New construction of ${units} near ${place}, ${run.spot.name}, Austin, Texas. ${zoning} ${flood} Owner, tax parcel, legal description, and sealed drawings are still required before submittal.`;
}

function buildingForm(run: RunRecord): PermitForm {
  const place = run.field.address ?? run.spot.name;
  const tokens = run.field.zoning ? zoningTokens(run.field.zoning) : [];
  const residential =
    run.constraints.kind === "housing" && !run.constraints.fourplex && (run.constraints.units == null || run.constraints.units <= 4);
  const historic =
    run.field.historic.state === "hit" || tokens.includes("H") || tokens.includes("HD")
      ? "Yes"
      : run.field.historic.state === "unknown"
        ? "Not checked"
        : "No";

  const title = residential
    ? "Residential New Construction and Addition Permit Application"
    : run.constraints.fourplex
      ? "Commercial Plan Review project information"
      : "Site plan project information";
  const sourceUrl = residential ? FORM_URL : run.constraints.fourplex ? RESIDENTIAL : SITE_PLAN;
  const sourceLabel = residential
    ? "City of Austin residential application"
    : run.constraints.fourplex
      ? "Residential plan review, fourplex projects"
      : "Austin site plan requirements";

  return {
    id: "building",
    title,
    sourceLabel,
    sourceUrl,
    fileName: residential ? "austin-residential-new-construction-draft.pdf" : "austin-project-information-draft.pdf",
    intro: residential
      ? "Field names follow the City of Austin Residential New Construction and Addition Permit Application. This draft is not submitted."
      : "This project does not use the residential four-unit application. The property facts below are filled from the city layers for the commercial or site-plan desk. This draft is not submitted.",
    sections: [
      {
        title: "Property",
        fields: [
          field("Project address", `${place}, Austin, Texas`),
          field("Nearest map label", place),
          field("Tax parcel ID", "Applicant to complete", "blank"),
          field("Legal description", "Applicant to complete", "blank"),
          field("Zoning district", run.field.zoning ?? "Not returned", run.field.zoning ? "filled" : "blank"),
          field("Lot area (sq ft)", "Applicant to complete", "blank"),
          field(
            "Neighborhood plan area",
            tokens.includes("NP")
              ? `The zoning string includes NP (${run.field.zoning}). Confirm the plan name on the property profile.`
              : "No neighborhood-plan token on the zoning string.",
          ),
          review(
            "Historic district",
            historic,
            historic === "Yes" ? "Historic layer or an H/HD zoning token intersects this point." : undefined,
          ),
        ],
      },
      {
        title: "Required reviews",
        fields: [
          review("S.M.A.R.T. Housing", "Not checked", "Applicant choice. No certification was provided."),
          review("Green Building requirement", "Not checked"),
          review("Airport overlay zone", fromLayers([run.field.airport])),
          review("Septic system", "Not checked"),
          review("Structure exceeds 3,600 sq ft under roof", "Not checked", "Floor area was not measured."),
          review("Within 200 feet of a hazardous pipeline", fromLayers([run.field.pipeline])),
          review(
            "Erosion hazard zone",
            fromLayers([run.field.creek]),
            fromLayers([run.field.creek]) === "Yes"
              ? "A creek centerline is within about 100 feet."
              : fromLayers([run.field.creek]) === "No"
                ? "No creek centerline within about 100 feet."
                : "The creek layer did not answer.",
          ),
          review(
            "Within 100 feet of the 100-year floodplain",
            fromLayers([run.field.fema, run.field.coaFlood, run.field.nearFlood]),
          ),
          review("Trees 19 inches or greater", "Not checked"),
          review("Capital view corridor", "Not checked"),
          review("Subchapter F", "Not checked", "Confirm on the city property profile."),
          review("Water availability", "Not checked"),
          review("Wastewater availability", "Not checked"),
          review("Auxiliary water source", "Not checked"),
          review("Cut or fill over four feet", "Not checked"),
          review("Waterfront overlay", "Not checked"),
          review("Lake Austin overlay", "Not checked"),
          review("Fronts a paved street", "Not checked"),
          review("Adjacent to a paved alley", "Not checked"),
          review("Board of Adjustment variance", "Not checked"),
        ],
      },
      {
        title: "Description of work",
        fields: [
          field("Existing use", "Not determined from the city layers", "blank"),
          field("Proposed use", proposedUse(run), run.constraints.units || run.constraints.fourplex ? "filled" : "blank"),
          field("Project type", "New construction"),
          field("Project description", workDescription(run, place)),
          field("Building height", "Applicant to complete", "blank"),
          field("Number of floors", "Applicant to complete", "blank"),
          field("Parking spaces required", "Applicant to complete", "blank"),
          field("Parking spaces provided", "Applicant to complete", "blank"),
          field(
            "Austin Energy BSPA",
            residential
              ? "Not required on residential permit applications as of October 2026."
              : "Confirm with the commercial desk.",
          ),
        ],
      },
    ],
  };
}

function tradeForm(run: RunRecord, id: string, title: string, work: string, residential: boolean): PermitForm {
  const place = run.field.address ?? run.spot.name;
  return {
    id,
    title,
    sourceLabel: residential
      ? "Trade boxes on the residential application"
      : "Trades requested with the building application",
    sourceUrl: residential ? FORM_URL : RESIDENTIAL,
    fileName: `austin-${id}-permit-draft.pdf`,
    intro: "Requested with the building application. The city issues the trade permit after the building application is accepted. This draft is not submitted.",
    sections: [
      {
        title: title,
        fields: [
          field("Project address", `${place}, Austin, Texas`),
          field("Zoning district", run.field.zoning ?? "Not returned", run.field.zoning ? "filled" : "blank"),
          field("Requested", "Yes", "yes"),
          field("Work", work),
          field("Contractor", "Applicant to name a registered contractor", "blank"),
          field("Valuation", "Applicant to complete", "blank"),
        ],
      },
    ],
  };
}

export function buildPermitPacket(run: RunRecord): PermitPacket {
  const place = run.field.address ?? run.spot.name;
  const residential =
    run.constraints.kind === "housing" && !run.constraints.fourplex && (run.constraints.units == null || run.constraints.units <= 4);
  const forms = [
    buildingForm(run),
    tradeForm(
      run,
      "electrical",
      "Electrical permit request",
      `New construction at ${place}. Electrical service and branch circuits for the proposed dwelling. Fixture counts stay with the applicant.`,
      residential,
    ),
    tradeForm(
      run,
      "plumbing",
      "Plumbing permit request",
      `New construction at ${place}. Domestic water, drain, and waste for the proposed dwelling. Fixture counts stay with the applicant.`,
      residential,
    ),
    tradeForm(
      run,
      "mechanical",
      "Mechanical permit request",
      `New construction at ${place}. Heating and cooling for the proposed dwelling. Equipment sizes stay with the applicant.`,
      residential,
    ),
  ];
  return {
    filledAt: new Date().toISOString(),
    clerkNote: `Filled ${forms.length} drafts for ${place} from the zoning, flood, and hazard reads. Lines marked for the applicant were not on those layers.`,
    forms,
  };
}
