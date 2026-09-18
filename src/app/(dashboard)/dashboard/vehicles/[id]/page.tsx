import { notFound } from "next/navigation";
import Link from "next/link";
import { getOwnedVehicle } from "@/features/vehicles/queries";
import { ensureFactorySpec } from "@/features/vehicles/factory-spec";
import { FactorySpecComparison } from "@/components/shared/factory-spec-comparison";
import { getMyPpiRequests } from "@/features/ppi/queries";
import { inspectionDisplayName } from "@/features/ppi/presentation";
import { makeVehicleFriendsOnly, makeVehiclePrivate, makeVehiclePublic } from "@/features/vehicles/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatMileage } from "@/lib/utils/formatting";
import { Car, ClipboardCheck, ExternalLink, FileText, ImagePlus, MessageSquare, Pencil, Share2, Tag, Wrench } from "lucide-react";
import { VehiclePhotoUploader } from "./vehicle-photo-uploader";
import { VehiclePhotoDeleteButton } from "./vehicle-photo-delete-button";
import { VehicleNotesForm } from "./vehicle-notes-form";
import { VehicleDeleteButton } from "./vehicle-danger-actions";
import { InspectionDeleteButton } from "@/components/shared/inspection-delete-button";
import { VehicleSoldAction } from "./vehicle-sold-action";
import { VehicleHandoffAction } from "./vehicle-handoff-action";
import { getOwnedVehicleTimelines } from "@/features/vehicles/timelines";
import { VehicleMaintenanceManager } from "./vehicle-timeline-manager";
import { VehicleBuildProgression } from "./vehicle-build-progression";
import { t as uiText } from "@/lib/i18n";
import { getRequestTranslator } from "@/lib/i18n/server";

type VehicleTab = "overview" | "posts" | "build" | "maintenance" | "inspections";

export default async function VehicleDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const uiText = await getRequestTranslator();
  const { id } = await params;
  const requestedTab = (await searchParams).tab;
  const activeTab: VehicleTab = ["posts", "build", "maintenance", "inspections"].includes(requestedTab ?? "")
    ? requestedTab as VehicleTab
    : "overview";
  const vehicle = await getOwnedVehicle(id);
  if (!vehicle) notFound();
  const [inspections, timelines] = await Promise.all([
    getMyPpiRequests({ vehicleId: id }),
    getOwnedVehicleTimelines(vehicle.owner_id!, id),
  ]);
  if (!timelines) notFound();
  // Factory layer (Renditions doc): establish it lazily for vehicles created
  // before it existed, then show it next to the owner's current build.
  const factorySpec = await ensureFactorySpec(vehicle);
  const currentBuild = {
    engine: vehicle.engine, transmission: vehicle.transmission, drivetrain: vehicle.drivetrain,
    body_style: vehicle.body_style, trim: vehicle.trim,
    engine_original: vehicle.engine_original, transmission_original: vehicle.transmission_original, drivetrain_original: vehicle.drivetrain_original,
  };

  const gallery = [...(vehicle.vehicle_media ?? [])].sort((a, b) => {
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.uploaded_at.localeCompare(b.uploaded_at);
  });
  const primaryMedia = gallery.find((media) => media.is_primary) ?? gallery[0] ?? null;
  const vehicleLabel = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") || uiText("ui.vehicle_a62394ba4a");
  const ownershipLabel = vehicle.ownership_state === "previously_owned"
    ? uiText("ui.previously_owned_c56be55e86")
    : vehicle.ownership_state === "considering"
      ? uiText("ui.shopping_considering_2850c42eca")
      : vehicle.ownership_state === "project" ? uiText("ui.project_9859597853") : uiText("ui.owned_17b760c41c");
  const isPublic = vehicle.visibility === "public";
  const visibilityLabel = vehicle.visibility === "friends" ? uiText("ui.friends_bd104d1b98") : vehicle.visibility === "public" ? uiText("ui.public_591935b15b") : uiText("ui.only_me_bdc0857b99");

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold">{vehicle.nickname || vehicleLabel}</h1>
          <p className="text-muted-foreground">{vehicle.nickname ? vehicleLabel : vehicle.trim || ownershipLabel}</p>
          {vehicle.nickname && vehicle.trim && <p className="text-sm text-muted-foreground">{vehicle.trim}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={isPublic ? "default" : "secondary"}>{visibilityLabel}</Badge>
          {vehicle.configuration_type !== "stock" ? <Badge variant="outline">{vehicle.configuration_type === "custom_build" ? uiText("ui.custom_build_4a2a5141b7") : uiText("ui.modified_e8ce5dcaf4")}</Badge> : null}
          <Button asChild variant="outline" size="sm">
            <Link href={`/dashboard/vehicles/${vehicle.id}/edit`}><Pencil className="mr-2 h-3.5 w-3.5" />{uiText("ui.edit_464c4ffd01")}</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/vehicle/${vehicle.id}`} target="_blank"><ExternalLink className="mr-2 h-3.5 w-3.5" />{uiText("ui.view_passport_ad9a37660d")}</Link>
          </Button>
        </div>
      </div>

      <nav aria-label={uiText("ui.vehicle_passport_sections_fc1efc1af6")} className="flex max-w-full gap-1 overflow-x-auto rounded-xl border bg-muted/40 p-1">
        {([
          ["overview", uiText("ui.overview_d4b1ea5708")],
          ["posts", uiText("ui.posts_a80811cf68")],
          ["build", uiText("ui.build_7d630a8ffd", { arg0: String(timelines.build.length ? ` (${timelines.build.length})` : "") })],
          ["maintenance", uiText("ui.maintenance_c27b4ef54b", { arg0: String(timelines.maintenance.length ? ` (${timelines.maintenance.length})` : "") })],
          ["inspections", uiText("ui.inspections_7dcdc3ec4f", { arg0: String(inspections.length ? ` (${inspections.length})` : "") })],
        ] as const).map(([key, label]) => (
          <Link
            key={key}
            href={key === "overview" ? `/dashboard/vehicles/${id}` : `/dashboard/vehicles/${id}?tab=${key}`}
            aria-current={activeTab === key ? "page" : undefined}
            className={`shrink-0 rounded-lg px-4 py-2 text-sm font-semibold ${activeTab === key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {activeTab === "overview" && <>
      <Card>
        <CardHeader><CardTitle>{uiText("ui.vehicle_details_5f09e0a945")}</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div><p className="text-sm text-muted-foreground">{uiText("ui.garage_relationship_e26b2f2b89")}</p><p>{ownershipLabel}</p></div>
          {vehicle.sold_at && <div><p className="text-sm text-muted-foreground">{uiText("ui.marked_sold_25baedf119")}</p><p>{formatDate(vehicle.sold_at)}</p></div>}
          {vehicle.vin && <div><p className="text-sm text-muted-foreground">{uiText("ui.vin_5e0211b12d")}</p><p className="font-mono">{vehicle.vin}</p></div>}
          <div><p className="text-sm text-muted-foreground">{uiText("ui.configuration_b332c3492d")}</p><p>{vehicle.configuration_type === "custom_build" ? uiText("ui.custom_build_4a2a5141b7") : vehicle.configuration_type === "modified" ? uiText("ui.modified_e8ce5dcaf4") : uiText("ui.stock_d5cade7ef3")}</p></div>
          {vehicle.mileage != null && <div><p className="text-sm text-muted-foreground">{uiText("ui.odometer_d26c569637")}</p><p>{formatMileage(vehicle.mileage)}{uiText("ui.miles_9e73814859")}</p><p className="text-xs text-muted-foreground">{vehicle.mileage_status === "actual" ? uiText("ui.reported_actual_mileage_7131f3624d") : vehicle.mileage_status === "not_actual" ? uiText("ui.not_actual_mileage_628ac83c1f") : uiText("ui.actual_mileage_unknown_2b63edfcfe")}{vehicle.mileage_updated_at ? uiText("ui.updated_957137ce63", { arg0: String(formatDate(vehicle.mileage_updated_at)) }) : ""}</p></div>}
          {vehicle.engine && <div><p className="text-sm text-muted-foreground">{uiText("ui.current_engine_motor_c513af8075")}</p><p>{vehicle.engine}</p><p className="text-xs text-muted-foreground">{vehicle.engine_original ? uiText("ui.reported_original_2f5ad11cd0") : uiText("ui.reported_swapped_1190798377")}</p></div>}
          {vehicle.drivetrain && <div><p className="text-sm text-muted-foreground">{uiText("ui.current_drivetrain_a23751a0e3")}</p><p>{vehicle.drivetrain}</p><p className="text-xs text-muted-foreground">{vehicle.drivetrain_original ? uiText("ui.reported_original_2f5ad11cd0") : uiText("ui.reported_converted_51ae7e12fc")}</p></div>}
          {vehicle.transmission && <div><p className="text-sm text-muted-foreground">{uiText("ui.current_transmission_c985bc1b17")}</p><p>{vehicle.transmission}</p><p className="text-xs text-muted-foreground">{vehicle.transmission_original ? uiText("ui.reported_original_2f5ad11cd0") : uiText("ui.reported_swapped_1190798377")}</p></div>}
          {vehicle.body_style && <div><p className="text-sm text-muted-foreground">{uiText("ui.body_style_191c24bf12")}</p><p>{vehicle.body_style}</p></div>}
          {vehicle.configuration_type === "custom_build" ? <div className="sm:col-span-2"><Button asChild variant="outline"><Link href={`/dashboard/vehicles/${vehicle.id}?tab=build`}><Wrench className="mr-2 h-4 w-4" />{uiText("ui.open_build_progression_fa22816eda")}</Link></Button></div> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{uiText("ui.factory_spec_vs_current_build_b0fd096fdc")}</CardTitle></CardHeader>
        <CardContent>
          <FactorySpecComparison spec={factorySpec} current={currentBuild} ownerView />
          {!vehicle.vin ? <p className="mt-3 text-xs text-muted-foreground">{uiText("ui.add_the_vin_to_record_the_factory_specificat_aa8b10d779")}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{uiText("ui.vehicle_actions_f7925256d5")}</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
            <Button asChild variant="outline" className="justify-start"><Link href={`/dashboard/vehicles/${vehicle.id}?tab=inspections`}><FileText className="mr-2 h-4 w-4" />{uiText("ui.view_inspections_and_reports_c48aad285f")}</Link></Button>
          <Button asChild variant="outline" className="justify-start"><Link href={`/dashboard/ppi/new?vehicle=${vehicle.id}`}><ClipboardCheck className="mr-2 h-4 w-4" />{uiText("ui.new_inspection_2841d576b4")}</Link></Button>
          {isPublic ? (
            <Button asChild variant="outline" className="justify-start"><Link href={`/dashboard/listings/new?vehicle=${vehicle.id}`}><Tag className="mr-2 h-4 w-4" />{uiText("ui.create_marketplace_listing_73df568a36")}</Link></Button>
          ) : (
            <Button variant="outline" className="justify-start" disabled title={uiText("ui.make_the_vehicle_public_first_5b0d6109dd")}><Tag className="mr-2 h-4 w-4" />{uiText("ui.create_marketplace_listing_73df568a36")}</Button>
          )}
          <Button asChild variant="outline" className="justify-start"><Link href="#vehicle-media"><ImagePlus className="mr-2 h-4 w-4" />{uiText("ui.add_media_a078fb55c6")}</Link></Button>
          {isPublic ? (
            <Button asChild variant="outline" className="justify-start"><Link href={`/dashboard/posts/new?vehicle=${vehicle.id}`}><Share2 className="mr-2 h-4 w-4" />{uiText("ui.share_29887a5ff9")}</Link></Button>
          ) : (
            <Button variant="outline" className="justify-start" disabled title={uiText("ui.make_the_vehicle_public_first_5b0d6109dd")}><Share2 className="mr-2 h-4 w-4" />{uiText("ui.share_29887a5ff9")}</Button>
          )}
          {isPublic ? (
            <Button asChild variant="outline" className="justify-start"><Link href={`/vehicle/${vehicle.id}?tab=posts`}><MessageSquare className="mr-2 h-4 w-4" />{uiText("ui.community_posts_about_this_vehicle_38121c2dad")}</Link></Button>
          ) : null}
          {isPublic ? (
            <Button asChild variant="outline" className="justify-start"><Link href={`/vehicle/${vehicle.id}`}><Tag className="mr-2 h-4 w-4" />{uiText("ui.marketplace_listing_page_92d9b841d1")}</Link></Button>
          ) : null}
          {!isPublic && <p className="text-xs text-muted-foreground sm:col-span-2">{uiText("ui.make_this_vehicle_public_before_creating_a_l_254783a58a")}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{uiText("ui.notes_8a7525b149")}</CardTitle></CardHeader>
        <CardContent><VehicleNotesForm vehicleId={vehicle.id} initialNotes={vehicle.notes ?? ""} /></CardContent>
      </Card>

      <Card id="vehicle-media">
        <CardHeader><CardTitle>{uiText("ui.photos_and_videos_2046ac8060")}</CardTitle></CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-[1fr_1.1fr]">
          <div className="overflow-hidden rounded-xl border bg-muted">
            {primaryMedia ? <VehicleMediaPreview media={primaryMedia} label={vehicleLabel} className="h-56 w-full" /> : (
              <div className="flex h-56 w-full items-center justify-center"><Car className="h-12 w-12 text-muted-foreground/40" /></div>
            )}
          </div>
          <VehiclePhotoUploader vehicleId={vehicle.id} />
          {gallery.length > 0 && (
            <div className="md:col-span-2">
              <p className="mb-3 text-sm font-medium">{uiText("ui.all_media_2e76c1bf75")}<span className="text-muted-foreground">({gallery.length})</span></p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {gallery.map((media) => (
                  <div key={media.id} className="group relative aspect-[4/3] overflow-hidden rounded-xl border bg-muted">
                    <VehicleMediaPreview media={media} label={vehicleLabel} className="absolute inset-0 h-full w-full" />
                    {media.is_primary && <span className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">{uiText("ui.primary_efe10c80ec")}</span>}
                    <VehiclePhotoDeleteButton vehicleId={vehicle.id} mediaId={media.id} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card id="visibility">
        <CardHeader><CardTitle>{uiText("ui.visibility_7448611d5f")}</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-sm font-medium">{uiText("ui.visible_to_5551efd77f")}{visibilityLabel}</p><p className="text-sm text-muted-foreground">{uiText("ui.friends_only_vehicles_appear_only_to_accepte_9997877991")}</p></div>
          <div className="flex flex-wrap gap-2">
            {vehicle.visibility !== "private" && <form action={makeVehiclePrivate}><input type="hidden" name="vehicle_id" value={vehicle.id} /><Button type="submit" variant="outline">{uiText("ui.only_me_bdc0857b99")}</Button></form>}
            {vehicle.visibility !== "friends" && <form action={makeVehicleFriendsOnly}><input type="hidden" name="vehicle_id" value={vehicle.id} /><Button type="submit" variant="outline">{uiText("ui.friends_bd104d1b98")}</Button></form>}
            {!isPublic && <form action={makeVehiclePublic}><input type="hidden" name="vehicle_id" value={vehicle.id} /><Button type="submit">{uiText("ui.public_591935b15b")}</Button></form>}
          </div>
        </CardContent>
      </Card>

      {["owned", "project"].includes(vehicle.ownership_state) && (
        <Card>
          <CardHeader><CardTitle>{uiText("ui.ownership_history_d074ebac10")}</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-sm font-medium">{uiText("ui.no_longer_own_this_vehicle_746191e3ae")}</p><p className="text-sm text-muted-foreground">{uiText("ui.close_active_listings_and_move_it_to_previou_10e5ca9ef4")}</p></div>
            <VehicleSoldAction
              vehicleId={vehicle.id}
              preview={{
                vehicleLabel,
                nickname: vehicle.nickname,
                details: [
                  vehicle.trim ? uiText("ui.trim_91ac83b1ae", { arg0: String(vehicle.trim) }) : null,
                  vehicle.engine ? uiText("ui.current_engine_motor_788b538013", { arg0: String(vehicle.engine) }) : null,
                  vehicle.drivetrain ? uiText("ui.current_drivetrain_9896b06374", { arg0: String(vehicle.drivetrain) }) : null,
                  vehicle.transmission ? uiText("ui.current_transmission_a79bf33f06", { arg0: String(vehicle.transmission) }) : null,
                  vehicle.body_style ? uiText("ui.body_style_c0b9833482", { arg0: String(vehicle.body_style) }) : null,
                  vehicle.mileage != null ? uiText("ui.reported_mileage_miles_da3173601c", { arg0: String(formatMileage(vehicle.mileage)) }) : null,
                ].filter((value): value is string => value !== null),
                mediaCount: gallery.filter((media) => media.moderation_status === "active").length,
                buildCount: timelines.build.filter((entry) => entry.is_public).length,
                maintenanceCount: timelines.maintenance.filter((entry) => entry.is_public).length,
              }}
            />
          </CardContent>
        </Card>
      )}
      {vehicle.ownership_state === "previously_owned" && (
        <Card>
          <CardHeader><CardTitle>{uiText("ui.buyer_garage_claim_ff8d5fe25a")}</CardTitle></CardHeader>
          <CardContent>
            <VehicleHandoffAction vehicleId={vehicle.id} vehicleLabel={vehicleLabel} hasVin={!!vehicle.vin} />
          </CardContent>
        </Card>
      )}
      </>}

      {activeTab === "posts" && (
        <Card>
          <CardHeader><CardTitle>{uiText("ui.vehicle_posts_354e8c7d3c")}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{uiText("ui.view_community_posts_attached_to_this_vehicl_d0ac935743")}</p>
            <div className="flex flex-wrap gap-3">
              {isPublic ? <Button asChild><Link href={`/dashboard/posts/new?vehicle=${vehicle.id}`}><Share2 className="mr-2 h-4 w-4" />{uiText("ui.create_post_80c6491121")}</Link></Button> : <Button disabled>{uiText("ui.make_vehicle_public_to_post_55974e5335")}</Button>}
              {isPublic && <Button asChild variant="outline"><Link href={`/vehicle/${vehicle.id}?tab=posts`}><MessageSquare className="mr-2 h-4 w-4" />{uiText("ui.view_posts_72502a0e74")}</Link></Button>}
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === "build" && <VehicleBuildProgression vehicleId={vehicle.id} timelines={timelines} media={vehicle.vehicle_media ?? []} />}
      {activeTab === "maintenance" && <VehicleMaintenanceManager vehicleId={vehicle.id} events={timelines.maintenance} />}

      {activeTab === "inspections" && <Card id="inspections">
        <CardHeader><CardTitle>{uiText("ui.inspections_and_reports_a166224160")}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {inspections.length === 0 ? <p className="text-sm text-muted-foreground">{uiText("ui.no_inspections_yet_for_this_vehicle_83e9099232")}</p> : inspections.map((inspection) => (
            <div key={inspection.id} className="flex items-center gap-3 rounded-xl border p-3">
              <Link href={`/dashboard/ppi/${inspection.id}`} className="min-w-0 flex-1 hover:text-primary">
                <p className="truncate font-semibold">{inspectionDisplayName(inspection.vehicle, inspection.ppi_type, inspection.created_at)}</p>
                <p className="text-xs capitalize text-muted-foreground">{inspection.status.replaceAll("_", " ")}{["submitted", "completed"].includes(inspection.status) ? uiText("ui.report_available_b57fb3289a") : ""}</p>
              </Link>
              <InspectionDeleteButton inspectionId={inspection.id} />
            </div>
          ))}
          <Button asChild><Link href={`/dashboard/ppi/new?vehicle=${vehicle.id}`}><ClipboardCheck className="mr-2 h-4 w-4" />{uiText("ui.start_inspection_945cba4b32")}</Link></Button>
        </CardContent>
      </Card>}

      {activeTab === "overview" && <div className="border-t pt-3"><VehicleDeleteButton vehicleId={vehicle.id} /></div>}
    </div>
  );
}

function VehicleMediaPreview({ media, label, className }: {
  media: { url: string; media_type: "image" | "video" };
  label: string;
  className: string;
}) {
  return media.media_type === "video" ? (
    <video src={media.url} controls playsInline preload="metadata" className={`${className} object-cover`} aria-label={uiText("ui.video_91259c4470", { arg0: String(label) })} />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={media.url} alt={uiText("ui.photo_d806f25a03", { arg0: String(label) })} className={`${className} object-cover`} />
  );
}
