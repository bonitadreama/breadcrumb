import {
  MAX_PHOTO_BYTES,
  photoAssetSchema,
  type PhotoAsset,
} from "../../domain/photos";
export async function loadPhoto(
  file: File,
  profileId: string,
): Promise<PhotoAsset> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error(
      "Choose a JPEG, PNG, or WebP photo. HEIC and animated formats are not supported yet; export a still JPEG or PNG first.",
    );
  if (file.size > MAX_PHOTO_BYTES)
    throw new Error(
      "Choose a photo smaller than 8 MB. Your original file has not changed.",
    );
  // Read structured chunks, rather than searching arbitrary compressed pixels.
  const bytes = new Uint8Array(await file.arrayBuffer()),
    view = new DataView(bytes.buffer);
  const chunk = (at: number) => String.fromCharCode(...bytes.slice(at, at + 4));
  if (file.type === "image/png")
    for (let offset = 8; offset + 12 <= bytes.length; ) {
      const size = view.getUint32(offset);
      if (chunk(offset + 4) === "acTL")
        throw new Error(
          "Use a still photo; animated PNG images are not supported.",
        );
      offset += size + 12;
    }
  if (file.type === "image/webp")
    for (let offset = 12; offset + 8 <= bytes.length; ) {
      const size = view.getUint32(offset + 4, true);
      if (["ANIM", "ANMF"].includes(chunk(offset)))
        throw new Error(
          "Use a still photo; animated WebP images are not supported.",
        );
      offset += 8 + size + (size % 2);
    }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read this photo."));
    reader.readAsDataURL(file);
  });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error("This file could not be opened as a photo."));
    img.src = dataUrl;
  });
  const asset = {
    id: crypto.randomUUID(),
    profileId,
    createdAt: new Date().toISOString(),
    mediaType: file.type,
    width: image.naturalWidth,
    height: image.naturalHeight,
    dataUrl,
  };
  const result = photoAssetSchema.safeParse(asset);
  if (!result.success)
    throw new Error(
      "Photo is too large or unsupported. Use a still image up to 40 megapixels and 8 MB.",
    );
  return result.data;
}
