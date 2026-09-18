"use client";

import { removeVehiclePhoto } from "@/features/vehicles/actions";
import { DeletePhotoButton } from "@/components/shared/delete-photo-button";

import { useTranslator } from "@/lib/i18n/client";

export function VehiclePhotoDeleteButton({
  vehicleId,
  mediaId,
}: {
  vehicleId: string;
  mediaId: string;
}) {
  const uiText = useTranslator();
  return (
    <DeletePhotoButton
      label={uiText("ui.delete_media_e0337935b7")}
      confirmMessage="Delete this media item? This cannot be undone."
      onDelete={() => removeVehiclePhoto({ vehicleId, mediaId })}
    />
  );
}
