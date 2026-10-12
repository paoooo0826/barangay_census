import { supabase } from "./supabase";
import type { Announcement } from "../types/database";

export type AnnouncementView = Announcement & {
  imageUrl?: string | null;
  originalImageUrl?: string | null;
};

export async function loadAnnouncementImages(row: Announcement, expiresIn: number): Promise<AnnouncementView> {
  const sign = async (path?: string | null) => {
    if (!path) return null;
    try {
      const { data, error } = await supabase.storage.from("announcement-images").createSignedUrl(path, expiresIn);
      return error ? null : data?.signedUrl ?? null;
    } catch { return null; }
  };
  const [imageUrl, originalImageUrl] = await Promise.all([
    sign(row.image_path),
    row.image_original_path === row.image_path ? Promise.resolve(null) : sign(row.image_original_path),
  ]);
  return { ...row, imageUrl, originalImageUrl: originalImageUrl ?? imageUrl };
}
