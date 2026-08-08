"use client";

import { removeVehiclePhoto } from "@/features/vehicles/actions";
import { DeletePhotoButton } from "@/components/shared/delete-photo-button";

export function VehiclePhotoDeleteButton({
  vehicleId,
  mediaId,
}: {
  vehicleId: string;
  mediaId: string;
}) {
  return (
    <DeletePhotoButton
      label="Delete photo"
      onDelete={() => removeVehiclePhoto({ vehicleId, mediaId })}
    />
  );
}
