import { InspectionWorkflowView } from "@/components/shared/inspection-workflow-view";
import { getCurrentSubmission } from "@/features/ppi/queries";
import { notFound } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sub?: string }>;
}

export default async function TechGuidedInspectionPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { sub } = await searchParams;

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
      returnPath={`/tech/ppi/${id}`}
    />
  );
}
