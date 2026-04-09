import { createClient } from "@/lib/supabase/server";

export async function getStandardizedOutput(submissionId: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("standardized_outputs")
    .select("*")
    .eq("ppi_submission_id", submissionId)
    .order("version", { ascending: false })
    .limit(1)
    .single();

  return data;
}

export async function getVscOutput(submissionId: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("vsc_outputs")
    .select("*")
    .eq("ppi_submission_id", submissionId)
    .order("version", { ascending: false })
    .limit(1)
    .single();

  return data;
}

export async function getOutputPair(submissionId: string) {
  const [standardized, vsc] = await Promise.all([
    getStandardizedOutput(submissionId),
    getVscOutput(submissionId),
  ]);

  return { standardized, vsc };
}
