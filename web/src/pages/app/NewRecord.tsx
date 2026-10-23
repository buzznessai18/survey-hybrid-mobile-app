import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronLeft, CircleCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useBlocker, useNavigate } from "react-router-dom";
import { Banner, Button, SelectField, TextArea, TextField, useConfirm } from "@/components/ui";
import { ApiError, errorMessage } from "@/lib/errors";
import { GENDER_LABELS, LAND_UNIT_LABELS } from "@/lib/labels";
import type { Gender, LandUnit } from "@/lib/types";
import {
  EMPTY_SERVICE_RECORD, parseLandSize, SERVICE_RECORD_FIELD_TO_FORM, serviceRecordSchema, type ServiceRecordFormValues,
} from "@/lib/validation";
import { ServiceRecordService } from "@/services/api";
import { recordCache } from "./recordCache";

const GENDER_OPTIONS = (["male", "female", "other"] as const).map((g) => ({ value: g, label: GENDER_LABELS[g] }));
const UNIT_OPTIONS = (["acre", "sq_m"] as const).map((u) => ({ value: u, label: LAND_UNIT_LABELS[u] }));
const blank = (s: string) => (s.trim() ? s.trim() : null);

/** Add a farmer equipment / service record: one form, saved to the backend. */
export default function NewRecord() {
  const navigate = useNavigate();
  const [saveError, setSaveError] = useState<string | null>(null);
  // Idempotency key for this record. It is kept across failed attempts, so a retry
  // after a lost response returns the already-saved record instead of a duplicate.
  const recordId = useRef(crypto.randomUUID());
  const saved = useRef(false);
  const { ask, dialog } = useConfirm();

  const { register, handleSubmit, formState, setError } = useForm<ServiceRecordFormValues>({
    resolver: zodResolver(serviceRecordSchema),
    defaultValues: EMPTY_SERVICE_RECORD,
    mode: "onTouched",
  });
  const errors = formState.errors;

  // Ask before leaving with unsaved details (in-app navigation and closing the tab).
  const blocker = useBlocker(({ currentLocation, nextLocation }) => formState.isDirty && !saved.current && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    void ask({ title: "Discard this record?", message: "The details you entered will be lost.", confirm: "Discard", danger: true }).then((ok) =>
      ok ? blocker.proceed() : blocker.reset(),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocker.state]);
  useEffect(() => {
    if (!formState.isDirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [formState.isDirty]);

  const save = handleSubmit(async (v) => {
    setSaveError(null);
    if (!navigator.onLine) return setSaveError("You're offline. Records are saved to the server, so connect to the internet before saving.");
    try {
      const { record, idempotent_replay } = await ServiceRecordService.create({
        id: recordId.current,
        farmer_name: v.farmerName.trim(),
        gender: (v.gender || null) as Gender | null,
        address: blank(v.address),
        survey_number: v.surveyNumber.trim(),
        sub_division: blank(v.subDivision),
        land_size: parseLandSize(v.landSize),
        land_unit: v.landUnit as LandUnit,
        service_details: blank(v.serviceDetails),
      });
      recordCache.put(record);
      saved.current = true;
      navigate(`/app/records/${record.id}?saved=${idempotent_replay ? "replay" : "new"}`, { replace: true });
    } catch (e) {
      // Values stay in the form; the same record id is reused on retry.
      const fields = e instanceof ApiError ? e.fields : undefined;
      let highlighted = false;
      for (const [key, message] of Object.entries(fields ?? {})) {
        const name = SERVICE_RECORD_FIELD_TO_FORM[key];
        if (name) {
          setError(name, { message });
          highlighted = true;
        }
      }
      setSaveError(highlighted ? "The record was not saved. Correct the highlighted fields." : `The record was not saved. ${errorMessage(e)}`);
    }
  });

  return (
    <div className="form-page">
      <Link to="/app/records" className="back-link"><ChevronLeft aria-hidden />Records</Link>
      <div className="page-head">
        <div>
          <h1>Add record</h1>
          <p>Fields marked <span className="req">*</span> are required. Date and time are recorded automatically when you save.</p>
        </div>
      </div>

      {saveError ? <Banner tone="error">{saveError}</Banner> : null}

      <form onSubmit={save} noValidate>
        <section className="form-section" aria-labelledby="sec-farmer">
          <h2 id="sec-farmer">Farmer</h2>
          <TextField label="Farmer name" required autoComplete="off" maxLength={150} placeholder="Full name" autoFocus error={errors.farmerName?.message} {...register("farmerName")} />
          <SelectField label="Gender" options={GENDER_OPTIONS} placeholder="Select gender" {...register("gender")} />
          <TextArea label="Address" maxLength={500} placeholder="House, village, taluka" rows={2} error={errors.address?.message} {...register("address")} />
        </section>

        <section className="form-section" aria-labelledby="sec-land">
          <h2 id="sec-land">Land</h2>
          <div className="row-2">
            <TextField label="Survey no." required maxLength={50} placeholder="e.g. 312" autoComplete="off" style={{ textTransform: "uppercase" }} error={errors.surveyNumber?.message} {...register("surveyNumber")} />
            <TextField label="Sub-division no." maxLength={50} placeholder="e.g. 4B" autoComplete="off" style={{ textTransform: "uppercase" }} error={errors.subDivision?.message} {...register("subDivision")} />
          </div>
          <div className="row-2">
            <TextField label="Land size" required inputMode="decimal" maxLength={16} placeholder="e.g. 2.5" autoComplete="off" error={errors.landSize?.message} {...register("landSize")} />
            <SelectField label="Unit" required options={UNIT_OPTIONS} placeholder="Select" error={errors.landUnit?.message} {...register("landUnit")} />
          </div>
        </section>

        <section className="form-section" aria-labelledby="sec-service">
          <h2 id="sec-service">Equipment / service</h2>
          <TextArea
            label="Equipment provided or work completed"
            maxLength={2000}
            rows={4}
            placeholder="e.g. Tractor provided. Land ploughing completed."
            hint="Describe in your own words what was provided or done."
            error={errors.serviceDetails?.message}
            {...register("serviceDetails")}
          />
        </section>

        <div className="form-footer">
          <Link to="/app/records" className="btn btn-secondary">Cancel</Link>
          <Button type="submit" icon={CircleCheck} loading={formState.isSubmitting} loadingText="Saving…">Save record</Button>
        </div>
      </form>
      {dialog}
    </div>
  );
}
