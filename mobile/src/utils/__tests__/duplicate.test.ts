import { duplicateCheckKey, interpretDuplicateCheck } from "../duplicate";
import { checkResponse, summary } from "./fixtures";

describe("interpretDuplicateCheck", () => {
  it("no matches -> none", () => {
    expect(interpretDuplicateCheck(checkResponse()).level).toBe("none");
    expect(interpretDuplicateCheck(null).level).toBe("none");
  });

  it("exact match -> duplicate with nearest distance", () => {
    const res = checkResponse({
      duplicate_found: true,
      possible_duplicate: true,
      nearest_distance_meters: 35,
      matches: [{ match_type: "exact_and_proximity", distance_meters: 35, within_radius: true, survey: summary() }],
    });
    const i = interpretDuplicateCheck(res);
    expect(i.level).toBe("duplicate");
    expect(i.nearestDistance).toBe(35);
    expect(i.primary?.survey?.farmer_mobile).toBe("******3210"); // masked value passed through untouched
  });

  it("proximity-only -> possible", () => {
    const res = checkResponse({
      possible_duplicate: true,
      nearest_distance_meters: 40,
      matches: [{ match_type: "proximity", distance_meters: 40, within_radius: true, survey: summary({ sub_division: "3" }) }],
    });
    expect(interpretDuplicateCheck(res).level).toBe("possible");
  });

  it("same farmer's other surveys are informational, not duplicates", () => {
    const res = checkResponse({ farmer_surveys: [summary({ survey_number: "999" })] });
    const i = interpretDuplicateCheck(res);
    expect(i.level).toBe("none");
    expect(i.farmerSurveys).toHaveLength(1);
  });
});

describe("duplicateCheckKey", () => {
  it("normalises inputs and includes location when present", () => {
    expect(duplicateCheckKey(" 125 ", "2")).toBe(duplicateCheckKey("125", " 2"));
    expect(duplicateCheckKey("125", "2", { latitude: 1, longitude: 2 })).not.toBe(duplicateCheckKey("125", "2"));
  });
});
