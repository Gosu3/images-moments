import type { Library } from "./library-model";

export function publicLibrary(library: Library): Library {
  return {
    revision: library.revision,
    settings: { title: library.settings.title, adminName: "" },
    albums: library.albums.map(({ slug, name, time }) => ({ slug, name, time })),
    photos: library.photos.filter(p => !p.demo && (!p.status || p.status === "ready")).map(p => ({
      id: p.id, album: p.album, filename: p.filename, alt: p.alt,
      width: p.width, height: p.height, takenAt: p.takenAt, status: "ready",
      src: `/api/library/photo/${encodeURIComponent(p.id)}?variant=preview`,
      preview: `/api/library/photo/${encodeURIComponent(p.id)}?variant=thumbnail`,
    })),
  };
}
