import type { Backup } from "../domain/types";
import type { PhotoAsset } from "../domain/photos";
import { canonical } from "../transfer/backup";
export function stagePhotos(
  data: Backup,
  incoming: PhotoAsset[],
  profileId: string,
) {
  for (const asset of incoming) {
    if (asset.profileId !== profileId)
      throw new Error("Photo belongs to another journal.");
    const existing = data.photoAssets.find((a) => a.id === asset.id);
    if (existing && canonical(existing) !== canonical(asset))
      throw new Error("The original photo cannot be overwritten.");
    if (!existing) data.photoAssets.push(asset);
  }
}
