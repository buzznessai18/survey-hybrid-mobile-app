import { callFunction } from "@/services/api/functions";
import type {
  CreateSurveyRequest,
  CreateSurveyResponse,
  DuplicateCheckRequest,
  DuplicateCheckResponse,
  GetMySurveysRequest,
  Paginated,
  SearchSurveysRequest,
  SurveyDetail,
  SurveyListItem,
  UpdateSurveyRequest,
} from "@/types/api";

/** Thin, typed wrappers over the existing Edge Functions. No business logic. */
export const SurveyService = {
  /** check-survey-duplicate — informational; never blocks submission. */
  async checkDuplicate(req: DuplicateCheckRequest): Promise<DuplicateCheckResponse> {
    const { data } = await callFunction<DuplicateCheckResponse>("check-survey-duplicate", req, { timeoutMs: 12_000 });
    return data;
  },

  /**
   * create-survey — idempotent on req.id. 201 = created, 200 with
   * idempotent_replay = already created by an earlier (retried) request.
   */
  async createSurvey(req: CreateSurveyRequest): Promise<CreateSurveyResponse> {
    const { data } = await callFunction<CreateSurveyResponse>("create-survey", req, { timeoutMs: 30_000 });
    return data;
  },

  async getMySurveys(req: GetMySurveysRequest): Promise<Paginated<SurveyListItem>> {
    const { data } = await callFunction<Paginated<SurveyListItem>>("get-my-surveys", req);
    return data;
  },

  /** search-surveys — every survey the caller may see (admins and users: all). */
  async searchSurveys(req: SearchSurveysRequest): Promise<Paginated<SurveyListItem>> {
    const { data } = await callFunction<Paginated<SurveyListItem>>("search-surveys", req);
    return data;
  },

  async getSurvey(id: string): Promise<SurveyDetail> {
    const body = /^SV-\d+$/i.test(id) ? { survey_id: id } : { id };
    const { data } = await callFunction<{ survey: SurveyDetail }>("get-survey", body);
    return data.survey;
  },

  /** update-survey — admins only. */
  async updateSurvey(req: UpdateSurveyRequest): Promise<SurveyDetail> {
    const { data } = await callFunction<{ survey: SurveyDetail }>("update-survey", req, { timeoutMs: 30_000 });
    return data.survey;
  },
};
