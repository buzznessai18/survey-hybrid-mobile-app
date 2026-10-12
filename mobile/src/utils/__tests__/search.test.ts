import { matchesQueueSearch, matchesSurveyNumber } from "@/utils/search";
import type { QueueItem } from "@/types/survey";

describe("matchesSurveyNumber", () => {
  it.each([
    ["312", true], ["312/", true], ["312/4", true], ["312/4b", true], ["312 / 4B", true],
    ["312/4C", false], ["312/5", false], ["31", false], ["3120", false], ["Gawas", false], ["/4B", false],
  ])("%s vs 312/4B -> %s", (term, expected) => {
    expect(matchesSurveyNumber(term, "312", "4B")).toBe(expected);
  });

  it("matches survey numbers without a sub-division only when none is typed", () => {
    expect(matchesSurveyNumber("312/", "312", null)).toBe(true);
    expect(matchesSurveyNumber("312/1", "312", null)).toBe(false);
  });
});

describe("matchesQueueSearch", () => {
  const item = {
    details: { farmerName: "Sitaram Gawas", farmerMobile: "9000031003", surveyNumber: "312", subDivision: "4B" },
    land: { village: "Aldona", occupantNames: "Sitaram Gawas" },
  } as unknown as QueueItem;

  it.each(["312/4b", "312/", "gawas", "aldona", "90000310", ""])("finds %p", (term) => {
    expect(matchesQueueSearch(item, term)).toBe(true);
  });
  it("rejects other survey numbers", () => expect(matchesQueueSearch(item, "312/1")).toBe(false));
});
