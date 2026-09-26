import { toApiError } from "@/services/api/errors";
import { supabase } from "@/services/supabase/client";
import type { Crop } from "@/types/api";

export const CropService = {
  /** Read-only: RLS lets every active user read crops (007_enable_rls.sql). */
  async listActive(): Promise<Crop[]> {
    const { data, error } = await supabase.from("crops").select("id, name").eq("status", "active").order("name");
    if (error) throw toApiError(error);
    return data ?? [];
  },
};
