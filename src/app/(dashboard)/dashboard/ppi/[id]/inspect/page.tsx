import { InspectionWorkflowView } from "@/components/shared/inspection-workflow-view";
import { getCurrentSubmission } from "@/features/ppi/queries";
import { notFound } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sub?: string }>;
}

export default async function SelfInspectionPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { sub } = await searchParams;

  // sub param is provided when redirected from intake wizard
  // Otherwise look up the current submission
  let submissionId = sub;

  if (!submissionId) {
    const submission = await getCurrentSubmission(id);
    if (!submission) notFound();
    submissionId = submission.id;
  }

  return (
    <InspectionWorkflowView
      requestId={id}
      submissionId={submissionId}
      returnPath={`/dashboard/ppi/${id}`}
    />
  );
}
