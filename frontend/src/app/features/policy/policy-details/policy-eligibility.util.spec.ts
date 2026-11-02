import { describe, it, expect } from "vitest";
import {
  humanizeKey,
  mapSavedEligibilityRules,
  normalizeStringList,
  parseConditionDescription,
  splitListText,
} from "./policy-eligibility.util";

describe("normalizeStringList", () => {
  it("passes arrays through, trimmed and compacted", () => {
    expect(normalizeStringList(["  a ", "", null, "b"])).toEqual(["a", "b"]);
  });

  it("parses serialized JSON arrays", () => {
    expect(normalizeStringList('["x", "y"]')).toEqual(["x", "y"]);
  });

  it("keeps a plain string as one item and maps nullish to []", () => {
    expect(normalizeStringList("single benefit")).toEqual(["single benefit"]);
    expect(normalizeStringList(null)).toEqual([]);
    expect(normalizeStringList(undefined)).toEqual([]);
    expect(normalizeStringList("   ")).toEqual([]);
  });
});

describe("splitListText", () => {
  it("splits comma-separated beneficiaries into individual points", () => {
    expect(
      splitListText(
        "Households, educational institutions, government offices, private businesses, electronic product manufacturers, authorized e-waste collection centres, registered recyclers, and urban local bodies.",
      ),
    ).toEqual([
      "Households",
      "educational institutions",
      "government offices",
      "private businesses",
      "electronic product manufacturers",
      "authorized e-waste collection centres",
      "registered recyclers",
      "urban local bodies",
    ]);
  });

  it("keeps a single beneficiary as one point and maps empty to []", () => {
    expect(splitListText("Small farmers")).toEqual(["Small farmers"]);
    expect(splitListText(null)).toEqual([]);
    expect(splitListText("   ")).toEqual([]);
  });
});

describe("humanizeKey", () => {
  it("converts snake_case keys into readable labels", () => {
    expect(humanizeKey("geographic_scope")).toBe("Geographic Scope");
    expect(humanizeKey("target_groups")).toBe("Target Groups");
    expect(humanizeKey("proposed_services")).toBe("Proposed Services");
    expect(humanizeKey("funding_approved")).toBe("Funding Approved");
    expect(humanizeKey("official_eligibility_rules_established")).toBe(
      "Official Eligibility Rules Established",
    );
  });
});

describe("mapSavedEligibilityRules", () => {
  it("maps each saved rule type to a readable group", () => {
    const groups = mapSavedEligibilityRules([
      { rule_type: "TARGET_BENEFICIARIES", value: "Small farmers" },
      { rule_type: "AGE_CRITERIA", min_age: 18, max_age: 60 },
      { rule_type: "GENDER", value: "Female" },
      { rule_type: "ANNUAL_INCOME_LIMIT", value: 250000 },
      { rule_type: "EDUCATION", value: "Graduate" },
      { rule_type: "CUSTOM_CONDITION", description: "Must own land" },
    ]);
    expect(groups.length).toBe(6);
    expect(groups[0]).toEqual({
      title: "Target Beneficiaries",
      lines: ["Small farmers"],
      bulleted: true,
      details: [],
    });
    expect(groups[1].lines).toEqual(["Age 18 - 60 years"]);
    expect(groups[3].lines[0]).toContain("\u20B9");
    expect(groups[5]).toEqual({
      title: "Additional Condition",
      lines: ["Must own land"],
      bulleted: false,
      details: [],
    });
  });

  it("renders beneficiary strings as individual bullet points", () => {
    const groups = mapSavedEligibilityRules([
      {
        rule_type: "TARGET_BENEFICIARIES",
        value: "Households, schools, and clinics.",
      },
    ]);
    expect(groups.length).toBe(1);
    expect(groups[0].bulleted).toBe(true);
    expect(groups[0].lines).toEqual(["Households", "schools", "clinics"]);
  });

  it("parses JSON conditions into labeled details, hiding workflow fields", () => {
    const groups = mapSavedEligibilityRules([
      {
        rule_type: "CUSTOM_CONDITION",
        description:
          '{"proposal": true, "status": "DRAFT_PROPOSAL", "geographic_scope": "All India", ' +
          '"target_groups": ["Households", "Schools"], "funding_approved": false, ' +
          '"official_eligibility_rules_established": false}',
      },
    ]);
    expect(groups.length).toBe(1);
    expect(groups[0].lines).toEqual([]);
    const labels = groups[0].details.map((d) => d.label);
    expect(labels).toContain("Geographic Scope");
    expect(labels).toContain("Target Groups");
    expect(labels).toContain("Funding Approved");
    expect(labels).toContain("Official Eligibility Rules Established");
    // Internal workflow fields are never exposed.
    expect(JSON.stringify(groups)).not.toContain("DRAFT_PROPOSAL");
    expect(labels).not.toContain("Proposal");
    expect(labels).not.toContain("Status");
    const byLabel = Object.fromEntries(
      groups[0].details.map((d) => [d.label, d]),
    );
    expect(byLabel["Target Groups"].items).toEqual([
      "Households",
      "Schools",
    ]);
    expect(byLabel["Funding Approved"].value).toBe("No");
    expect(byLabel["Geographic Scope"].value).toBe("All India");
  });

  it("renders untyped proposal objects, unwrapping additionalProp wrappers", () => {
    const groups = mapSavedEligibilityRules([
      {
        additionalProp1: {
          status: "DRAFT_PROPOSAL",
          applicability: "Proposed framework",
          target_groups: ["Rural households", "Gram Panchayats"],
          funding_approved: false,
        },
      },
    ]);
    expect(groups.length).toBe(1);
    expect(groups[0].title).toBe("Additional Condition");
    const labels = groups[0].details.map((d) => d.label);
    expect(labels).toContain("Applicability");
    expect(labels).toContain("Target Groups");
    expect(JSON.stringify(groups)).not.toContain("DRAFT_PROPOSAL");
  });

  it("falls back to safe text for invalid JSON and plain descriptions", () => {
    const groups = mapSavedEligibilityRules([
      { rule_type: "CUSTOM_CONDITION", description: "{not valid json" },
      { rule_type: "CUSTOM_CONDITION", description: "Just a note" },
    ]);
    expect(groups.length).toBe(2);
    expect(groups[0].lines).toEqual(["{not valid json"]);
    expect(groups[1].lines).toEqual(["Just a note"]);
  });

  it("skips unrestrictive and empty rows without inventing values", () => {
    expect(
      mapSavedEligibilityRules([
        { rule_type: "GENDER", value: "All" },
        { rule_type: "CUSTOM_CONDITION", description: "   " },
        { rule_type: "" },
        {},
        null,
        "raw-string",
      ]),
    ).toEqual([]);
    expect(mapSavedEligibilityRules(null)).toEqual([]);
    expect(mapSavedEligibilityRules(undefined)).toEqual([]);
  });

  it("renders partial age bounds and boolean disability flags", () => {
    const groups = mapSavedEligibilityRules([
      { rule_type: "AGE_CRITERIA", min_age: 21 },
      { rule_type: "DISABILITY_STATUS", value: true },
    ]);
    expect(groups[0].lines).toEqual(["Minimum age: 21 years"]);
    expect(groups[1].lines).toEqual([
      "Applicable to persons with disabilities",
    ]);
  });
});

describe("beneficiary deduplication", () => {
  const beneficiaries = {
    rule_type: "TARGET_BENEFICIARIES",
    value: "Households,  schools ",
  };

  it("drops fully duplicated target groups but keeps unique conditions", () => {
    const groups = mapSavedEligibilityRules([
      beneficiaries,
      {
        rule_type: "CUSTOM_CONDITION",
        description:
          '{"geographic_scope": "All India", "target_groups": ["households", "SCHOOLS"], "funding_approved": true}',
      },
    ]);
    // Dedicated beneficiaries stay untouched.
    expect(groups[0].lines).toEqual(["Households", "schools"]);
    // Additional Condition keeps unique fields; duplicated list is gone.
    expect(groups.length).toBe(2);
    const labels = groups[1].details.map((d) => d.label);
    expect(labels).toContain("Geographic Scope");
    expect(labels).toContain("Funding Approved");
    expect(labels).not.toContain("Target Groups");
    expect(groups[1].details.find(
      (d) => d.label === "Funding Approved",
    )?.value).toBe("Yes");
  });

  it("shows only genuinely new target-group values", () => {
    const groups = mapSavedEligibilityRules([
      beneficiaries,
      {
        rule_type: "CUSTOM_CONDITION",
        description:
          '{"target_groups": ["Households", "Clinics"], "funding_approved": false}',
      },
    ]);
    const targetGroups = groups[1].details.find(
      (d) => d.label === "Target Groups",
    );
    expect(targetGroups?.items).toEqual(["Clinics"]);
  });

  it("drops an Additional Condition left empty by deduplication", () => {
    const groups = mapSavedEligibilityRules([
      beneficiaries,
      {
        rule_type: "CUSTOM_CONDITION",
        description: '{"target_groups": ["households"]}',
      },
    ]);
    expect(groups.length).toBe(1);
    expect(groups[0].title).toBe("Target Beneficiaries");
  });

  it("does not deduplicate unrelated fields with matching text", () => {
    const groups = mapSavedEligibilityRules([
      beneficiaries,
      {
        rule_type: "CUSTOM_CONDITION",
        description:
          '{"proposed_services": ["Households"], "target_groups": ["Clinics"]}',
      },
    ]);
    const byLabel = Object.fromEntries(
      groups[1].details.map((d) => [d.label, d]),
    );
    // Same text, different field: preserved.
    expect(byLabel["Proposed Services"].items).toEqual(["Households"]);
    expect(byLabel["Target Groups"].items).toEqual(["Clinics"]);
  });

  it("leaves target groups alone when no dedicated list exists", () => {
    const groups = mapSavedEligibilityRules([
      {
        rule_type: "CUSTOM_CONDITION",
        description: '{"target_groups": ["Households", "Schools"]}',
      },
    ]);
    expect(groups[0].details[0]).toMatchObject({
      label: "Target Groups",
      items: ["Households", "Schools"],
    });
  });

  it("drops additional-condition lines duplicating beneficiaries", () => {
    const groups = mapSavedEligibilityRules([
      {
        rule_type: "TARGET_BENEFICIARIES",
        value: "Small farmers, Rural youth",
      },
      { rule_type: "CUSTOM_CONDITION", description: "Small Farmers" },
      { rule_type: "CUSTOM_CONDITION", description: "Must own land" },
    ]);
    expect(groups.length).toBe(2);
    expect(groups[0].lines).toEqual(["Small farmers", "Rural youth"]);
    expect(groups[1].lines).toEqual(["Must own land"]);
  });

  it("renders keyword values[] as a labeled bullet list", () => {
    const groups = mapSavedEligibilityRules([
      {
        rule_type: "CUSTOM_CONDITION",
        key: "Target Beneficiaries",
        values: ["Households", "Schools", ""],
        description: "Target Beneficiaries: Households, Schools",
      },
    ]);
    expect(groups.length).toBe(1);
    expect(groups[0].details).toEqual([
      { label: "Target Beneficiaries", items: ["Households", "Schools"] },
    ]);
  });

  it("dedups custom Target Beneficiaries values against the dedicated list", () => {
    const groups = mapSavedEligibilityRules([
      {
        rule_type: "TARGET_BENEFICIARIES",
        value: "Households, Schools",
      },
      {
        rule_type: "CUSTOM_CONDITION",
        key: "Target Beneficiaries",
        values: ["households", "Clinics"],
        description: "Target Beneficiaries: households, Clinics",
      },
    ]);
    expect(groups.length).toBe(2);
    expect(groups[1].details).toEqual([
      { label: "Target Beneficiaries", items: ["Clinics"] },
    ]);
  });

  it("drops a beneficiary keyword left empty by deduplication", () => {
    const groups = mapSavedEligibilityRules([
      { rule_type: "TARGET_BENEFICIARIES", value: "Households" },
      {
        rule_type: "CUSTOM_CONDITION",
        key: "Target Beneficiaries",
        values: ["HOUSEHOLDS"],
        description: "Target Beneficiaries: HOUSEHOLDS",
      },
      { rule_type: "CUSTOM_CONDITION", description: "Must own land" },
    ]);
    expect(groups.length).toBe(2);
    expect(groups[1].lines).toEqual(["Must own land"]);
  });
});
describe("parseConditionDescription", () => {
  it("returns empty for blank input", () => {
    expect(parseConditionDescription("   ")).toEqual({});
    expect(parseConditionDescription(null)).toEqual({});
  });
});

describe("real saved records (E-Waste policies)", () => {
  it("renders policy 184 rules: 8 beneficiary bullets + structured condition", () => {
    const groups = mapSavedEligibilityRules([
      {
        value:
          "Households, educational institutions, government offices, private businesses, electronic product manufacturers, authorized e-waste collection centres, registered recyclers, and urban local bodies.",
        rule_type: "TARGET_BENEFICIARIES",
      },
      {
        rule_type: "CUSTOM_CONDITION",
        description:
          '{   "proposal": true,   "status": "DRAFT_PROPOSAL",   "geographic_scope": "All India",   "target_groups": [     "Households",     "Educational institutions",     "Government offices",     "Private businesses",     "Electronic product manufacturers",     "Authorized collection centres",     "Registered recyclers",     "Urban local bodies"   ],   "proposed_services": [     "E-waste collection",     "Waste segregation",     "Authorized recycling",     "Material recovery",     "Public awareness"   ],   "funding_approved": false,   "official_eligibility_rules_established": false }',
      },
    ]);
    expect(groups.length).toBe(2);
    expect(groups[0].title).toBe("Target Beneficiaries");
    expect(groups[0].bulleted).toBe(true);
    expect(groups[0].lines.length).toBe(8);
    expect(groups[0].lines[0]).toBe("Households");
    expect(groups[0].lines[7]).toBe("urban local bodies");
    const byLabel = Object.fromEntries(
      groups[1].details.map((d) => [d.label, d]),
    );
    // Seven of the eight target groups duplicate the dedicated
    // beneficiaries list; only the genuinely new value remains.
    expect(byLabel["Target Groups"].items).toEqual([
      "Authorized collection centres",
    ]);
    expect(byLabel["Proposed Services"].items?.length).toBe(5);
    expect(byLabel["Funding Approved"].value).toBe("No");
    const serialized = JSON.stringify(groups);
    expect(serialized).not.toContain("DRAFT_PROPOSAL");
    expect(serialized).not.toContain('"proposal"');
    expect(serialized).not.toContain("{   ");
  });

  it("renders policy 117 proposal object with nested condition bullets", () => {
    const groups = mapSavedEligibilityRules([
      {
        additionalProp1: {
          status: "DRAFT_PROPOSAL",
          applicability: "Proposed national rural waste management framework",
          target_groups: [
            "Rural households",
            "Gram Panchayats",
            "Village-level institutions",
            "Self-help groups",
            "Waste collection and recycling workers",
            "Rural small businesses",
            "Community-based organizations",
            "Local waste management service providers",
          ],
          funding_approved: false,
          proposed_eligibility_conditions: [
            "Participating villages must meet the requirements established in approved programme guidelines",
            "Infrastructure assistance will depend on approved funding and local implementation plans",
            "Waste collection and processing activities must comply with applicable environmental regulations",
            "Financial assistance, if introduced, will be subject to officially established eligibility criteria",
          ],
          official_eligibility_rules_established: false,
        },
      },
    ]);
    expect(groups.length).toBe(1);
    const byLabel = Object.fromEntries(
      groups[0].details.map((d) => [d.label, d]),
    );
    expect(byLabel["Applicability"].value).toBe(
      "Proposed national rural waste management framework",
    );
    expect(byLabel["Target Groups"].items?.length).toBe(8);
    expect(byLabel["Proposed Eligibility Conditions"].items?.length).toBe(4);
    expect(JSON.stringify(groups)).not.toContain("DRAFT_PROPOSAL");
  });
});
