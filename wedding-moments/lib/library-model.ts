import { albums, photos, type Photo } from "./mock-data";

export type LibraryPhoto = Photo & { filename: string; demo?: boolean; key?: string };
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
