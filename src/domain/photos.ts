import { z } from "zod";

export const photoKey = "breadcrumb.photos";
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
export const MAX_PHOTO_DATA = 48 * 1024 * 1024;
export const MAX_BACKUP_BYTES = 100 * 1024 * 1024;
const point = z
  .object({
    x: z.number().finite().min(0).max(1),
    y: z.number().finite().min(0).max(1),
  })
  .strict();
export const markSchema = z
  .object({
    tool: z.enum(["pen", "arrow", "circle"]),
    color: z.enum(["#e64040", "#ffdb4d", "#ffffff", "#583b53"]),
    points: z.array(point).min(2).max(500),
  })
  .strict()
  .refine(
    (m) => m.tool === "pen" || m.points.length === 2,
    "Shapes need two points",
  );
export const attachmentSchema = z
  .object({
    assetId: z.string().uuid(),
    caption: z.string().max(1000),
    marks: z.array(markSchema).max(100),
  })
  .strict();
export const photoExtensionSchema = z
  .object({ version: z.literal(1), items: z.array(attachmentSchema).max(6) })
  .strict();
export const photoAssetSchema = z
  .object({
    id: z.string().uuid(),
    profileId: z.string().uuid(),
    createdAt: z.string().datetime({ offset: true }),
    mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    width: z.number().int().positive().max(20000),
    height: z.number().int().positive().max(20000),
    dataUrl: z.string().max(Math.ceil(MAX_PHOTO_BYTES / 3) * 4 + 50),
  })
  .strict()
  .superRefine((a, ctx) => {
    const prefix = `data:${a.mediaType};base64,`,
      body = a.dataUrl.slice(prefix.length);
    const decodedSize =
      (body.length / 4) * 3 -
      (body.endsWith("==") ? 2 : body.endsWith("=") ? 1 : 0);
    if (decodedSize > MAX_PHOTO_BYTES)
      ctx.addIssue({ code: "custom", message: "Photo exceeds 8 MB" });
    if (
      !a.dataUrl.startsWith(prefix) ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(body) ||
      body.length % 4 !== 0 ||
      !body ||
      a.width * a.height > 40000000
    )
      ctx.addIssue({
        code: "custom",
        message: "Invalid photo encoding or dimensions",
      });
    // Reject disguised non-raster content without evaluating or loading a URL.
    if (a.mediaType === "image/png" && !body.startsWith("iVBORw0KGgo"))
      ctx.addIssue({ code: "custom", message: "Invalid PNG signature" });
    if (a.mediaType === "image/jpeg" && !body.startsWith("/9j/"))
      ctx.addIssue({ code: "custom", message: "Invalid JPEG signature" });
    if (a.mediaType === "image/webp") {
      try {
        const bytes = atob(body.slice(0, 16));
        if (bytes.slice(0, 4) !== "RIFF" || bytes.slice(8, 12) !== "WEBP")
          throw new Error();
      } catch {
        ctx.addIssue({ code: "custom", message: "Invalid WebP signature" });
      }
    }
  });
export type PhotoAsset = z.infer<typeof photoAssetSchema>;
export type Attachment = z.infer<typeof attachmentSchema>;
export type PhotoMark = z.infer<typeof markSchema>;
export function attachments(o: {
  extensions: Record<string, unknown>;
}): Attachment[] {
  const raw = o.extensions[photoKey];
  if (raw === undefined) return [];
  const parsed = photoExtensionSchema.safeParse(raw);
  if (!parsed.success)
    throw new Error(
      "Invalid photo annotations or attachments. Nothing was changed.",
    );
  return parsed.data.items;
}
