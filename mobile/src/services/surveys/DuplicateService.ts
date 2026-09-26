import type { DuplicateCheckRequest, DuplicateCheckResponse } from "@/types/api";
import { interpretDuplicateCheck } from "@/utils/duplicate";
import { normalizeMobile } from "@/utils/mobile";
import { SurveyService } from "./SurveyService";

/**
 * Duplicate detection is done entirely by the backend
 * (public.find_survey_duplicates). This service only shapes the request and
 * interprets the response for the UI.
 */
export const DuplicateService = {
  async check(input: {
    surveyNumber: string;
    subDivision?: string;
    location?: { latitude: number; longitude: number } | null;
    farmerMobile?: string;
    excludeSurveyId?: string;
  }): Promise<DuplicateCheckResponse> {
    const req: DuplicateCheckRequest = {
      survey_number: input.surveyNumber.trim(),
      sub_division: input.subDivision?.trim() ? input.subDivision.trim() : null,
    };
    if (input.location) {
      req.latitude = input.location.latitude;
      req.longitude = input.location.longitude;
    }
    if (input.farmerMobile) {
      const mobile = normalizeMobile(input.farmerMobile);
      if (/^\d{10}$/.test(mobile)) req.farmer_mobile = mobile;
    }
    if (input.excludeSurveyId) req.exclude_survey_id = input.excludeSurveyId;
    return SurveyService.checkDuplicate(req);
  },

  interpret: interpretDuplicateCheck,
};
