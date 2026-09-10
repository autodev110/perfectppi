import { notFound } from "next/navigation";
import Link from "next/link";
import { getOwnedVehicle } from "@/features/vehicles/queries";
import { getMyPpiRequests } from "@/features/ppi/queries";
import { inspectionDisplayName } from "@/features/ppi/presentation";
import { makeVehiclePrivate, makeVehiclePublic } from "@/features/vehicles/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatMileage } from "@/lib/utils/formatting";
import { Car, ClipboardCheck, ExternalLink, FileText, ImagePlus, Pencil, Share2, Tag } from "lucide-react";
import { VehiclePhotoUploader } from "./vehicle-photo-uploader";
import { VehiclePhotoDeleteButton } from "./vehicle-photo-delete-button";
import { VehicleNotesForm } from "./vehicle-notes-form";
import { VehicleDeleteButton } from "./vehicle-danger-actions";
import { InspectionDeleteButton } from "@/components/shared/inspection-delete-button";

export default async function VehicleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [vehicle, inspections] = await Promise.all([
    getOwnedVehicle(id),
    getMyPpiRequests({ vehicleId: id }),
  ]);
  if (!vehicle) notFound();

  const gallery = [...(vehicle.vehicle_media ?? [])].sort((a, b) => {
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.uploaded_at.localeCompare(b.uploaded_at);
  });
  const primaryMedia = gallery.find((media) => media.is_primary) ?? gallery[0] ?? null;
  const vehicleLabel = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Vehicle";
  const ownershipLabel = vehicle.ownership_state === "previously_owned"
    ? "Previously owned"
    : vehicle.ownership_state === "considering"
      ? "Shopping / considering"
      : vehicle.ownership_state === "project" ? "Project" : "Owned";
  const isPublic = vehicle.visibility === "public";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold">{vehicle.nickname || vehicleLabel}</h1>
          <p className="text-muted-foreground">{vehicle.nickname ? vehicleLabel : vehicle.trim || ownershipLabel}</p>
          {vehicle.nickname && vehicle.trim && <p className="text-sm text-muted-foreground">{vehicle.trim}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={isPublic ? "default" : "secondary"}>{vehicle.visibility}</Badge>
          <Button asChild variant="outline" size="sm">
            <Link href={`/dashboard/vehicles/${vehicle.id}/edit`}><Pencil className="mr-2 h-3.5 w-3.5" />Edit</Link>
          </Button>
          {isPublic && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/vehicle/${vehicle.id}`} target="_blank"><ExternalLink className="mr-2 h-3.5 w-3.5" />Public Page</Link>
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Vehicle Details</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div><p className="text-sm text-muted-foreground">Garage relationship</p><p>{ownershipLabel}</p></div>
          {vehicle.vin && <div><p className="text-sm text-muted-foreground">VIN</p><p className="font-mono">{vehicle.vin}</p></div>}
          {vehicle.mileage != null && <div><p className="text-sm text-muted-foreground">Mileage</p><p>{formatMileage(vehicle.mileage)} miles</p>{vehicle.mileage_updated_at && <p className="text-xs text-muted-foreground">Updated {formatDate(vehicle.mileage_updated_at)}</p>}</div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Vehicle Actions</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Button asChild variant="outline" className="justify-start"><Link href="#inspections"><FileText className="mr-2 h-4 w-4" />View Inspections and Reports</Link></Button>
          <Button asChild variant="outline" className="justify-start"><Link href={`/dashboard/ppi/new?vehicle=${vehicle.id}`}><ClipboardCheck className="mr-2 h-4 w-4" />New Inspection</Link></Button>
          {isPublic ? (
            <Button asChild variant="outline" className="justify-start"><Link href={`/dashboard/listings/new?vehicle=${vehicle.id}`}><Tag className="mr-2 h-4 w-4" />Create Marketplace Listing</Link></Button>
          ) : (
            <Button variant="outline" className="justify-start" disabled title="Make the vehicle public first"><Tag className="mr-2 h-4 w-4" />Create Marketplace Listing</Button>
          )}
          <Button asChild variant="outline" className="justify-start"><Link href="#vehicle-media"><ImagePlus className="mr-2 h-4 w-4" />Add Media</Link></Button>
          {isPublic ? (
            <Button asChild variant="outline" className="justify-start"><Link href={`/dashboard/posts/new?vehicle=${vehicle.id}`}><Share2 className="mr-2 h-4 w-4" />Share</Link></Button>
          ) : (
            <Button variant="outline" className="justify-start" disabled title="Make the vehicle public first"><Share2 className="mr-2 h-4 w-4" />Share</Button>
          )}
          {!isPublic && <p className="text-xs text-muted-foreground sm:col-span-2">Make this vehicle public before creating a listing or attaching it to a community post.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
        <CardContent><VehicleNotesForm vehicleId={vehicle.id} initialNotes={vehicle.notes ?? ""} /></CardContent>
      </Card>

      <Card id="vehicle-media">
        <CardHeader><CardTitle>Photos and Videos</CardTitle></CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-[1fr_1.1fr]">
          <div className="overflow-hidden rounded-xl border bg-muted">
            {primaryMedia ? <VehicleMediaPreview media={primaryMedia} label={vehicleLabel} className="h-56 w-full" /> : (
              <div className="flex h-56 w-full items-center justify-center"><Car className="h-12 w-12 text-muted-foreground/40" /></div>
            )}
          </div>
          <VehiclePhotoUploader vehicleId={vehicle.id} />
          {gallery.length > 0 && (
            <div className="md:col-span-2">
              <p className="mb-3 text-sm font-medium">All media <span className="text-muted-foreground">({gallery.length})</span></p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {gallery.map((media) => (
                  <div key={media.id} className="group relative aspect-[4/3] overflow-hidden rounded-xl border bg-muted">
                    <VehicleMediaPreview media={media} label={vehicleLabel} className="absolute inset-0 h-full w-full" />
                    {media.is_primary && <span className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">Primary</span>}
                    <VehiclePhotoDeleteButton vehicleId={vehicle.id} mediaId={media.id} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card id="visibility">
        <CardHeader><CardTitle>Visibility</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-sm font-medium">This vehicle is currently {vehicle.visibility}.</p><p className="text-sm text-muted-foreground">Public vehicles can be shared and listed on the marketplace.</p></div>
          {isPublic ? (
            <form action={makeVehiclePrivate}><input type="hidden" name="vehicle_id" value={vehicle.id} /><Button type="submit" variant="outline">Make Private</Button></form>
          ) : (
            <form action={makeVehiclePublic}><input type="hidden" name="vehicle_id" value={vehicle.id} /><Button type="submit">Make Public</Button></form>
          )}
        </CardContent>
      </Card>

      <Card id="inspections">
        <CardHeader><CardTitle>Inspections and Reports</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {inspections.length === 0 ? <p className="text-sm text-muted-foreground">No inspections yet for this vehicle.</p> : inspections.map((inspection) => (
            <div key={inspection.id} className="flex items-center gap-3 rounded-xl border p-3">
              <Link href={`/dashboard/ppi/${inspection.id}`} className="min-w-0 flex-1 hover:text-primary">
                <p className="truncate font-semibold">{inspectionDisplayName(inspection.vehicle, inspection.ppi_type, inspection.created_at)}</p>
                <p className="text-xs capitalize text-muted-foreground">{inspection.status.replaceAll("_", " ")}{["submitted", "completed"].includes(inspection.status) ? " · Report available" : ""}</p>
              </Link>
              <InspectionDeleteButton inspectionId={inspection.id} />
            </div>
          ))}
          <Button asChild><Link href={`/dashboard/ppi/new?vehicle=${vehicle.id}`}><ClipboardCheck className="mr-2 h-4 w-4" />Start Inspection</Link></Button>
        </CardContent>
      </Card>

      <div className="border-t pt-3"><VehicleDeleteButton vehicleId={vehicle.id} /></div>
    </div>
  );
}

function VehicleMediaPreview({ media, label, className }: {
  media: { url: string; media_type: "image" | "video" };
  label: string;
  className: string;
}) {
  return media.media_type === "video" ? (
    <video src={media.url} controls playsInline preload="metadata" className={`${className} object-cover`} aria-label={`${label} video`} />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={media.url} alt={`${label} photo`} className={`${className} object-cover`} />
  );
}
