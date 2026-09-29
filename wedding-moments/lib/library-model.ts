import { albums, photos, type Photo } from "./mock-data";

export type LibraryPhoto = Photo & {
  filename: string; demo?: boolean; key?: string; storage?: "binding" | "s3";
  size?: number; sha256?: string; contentType?: string; imageId?: string;
  previewStatus?: "ready" | "failed" | "disabled"; uploadId?: string;
  pipeline?: "r2-v2"; previewKey?: string; previewWidth?: number; previewHeight?: number;
  status?: "pending" | "processing" | "ready" | "failed" | "deleted";
  stagingKey?: string; uploadExpiresAt?: string; createdAt?: string; updatedAt?: string;
  processingToken?: string; processingUntil?: string; deletedAt?: string; cleanupAfter?: string;
  error?: string;
  legacySource?: { key?: string; storage?: "binding" | "s3"; imageId?: string; src: string; preview: string };
  migrationTarget?: { key: string; previewKey: string; stagingKey: string };
  cleanupComplete?: boolean;
};
export type LibraryAlbum = { slug: string; name: string; time: string };
export type Library = { albums: LibraryAlbum[]; photos: LibraryPhoto[]; settings: { adminName: string; title: string }; revision: number };

export function demoLibrary(): Library {
  return {
    albums: albums.map(({ slug, name, time }) => ({ slug, name, time })),
    photos: albums.flatMap((album, a) => Array.from({ length: album.count }, (_, i) => {
      const photo = photos[(a * 5 + i) % photos.length];
      return { ...photo, id: `${album.slug}-${i + 1}`, album: album.slug, alt: `${album.name} — ảnh ${i + 1}`, filename: `${album.slug}-${i + 1}.webp`, demo: true };
    })),
    settings: { adminName: "Thọ Nguyễn", title: "Khoảnh khắc của chúng mình" },
    revision: 0,
  };
}
