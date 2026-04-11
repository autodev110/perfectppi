import { getFullWarrantyFlow } from "@/features/warranty/queries";
import { notFound, redirect } from "next/navigation";
import { WarrantyFlowClient } from "./warranty-flow-client";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ payment?: string }>;
}

export default async function WarrantyDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { payment } = await searchParams;

  const flow = await getFullWarrantyFlow(id);
  if (!flow) notFound();

  // Redirect non-eligible back to warranty list
  if (flow.option.plans.length === 0) {
    redirect("/dashboard/warranty");
  }

  const vehicleName = flow.vehicle
    ? [flow.vehicle.year, flow.vehicle.make, flow.vehicle.model, flow.vehicle.trim]
        .filter(Boolean)
        .join(" ")
    : "Unknown Vehicle";

  return (
    <WarrantyFlowClient
      flow={flow}
      vehicleName={vehicleName}
      paymentCallback={payment ?? null}
    />
  );
}
