import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GalleryExperience } from "@/components/gallery-experience";
import { albums, photos } from "@/lib/mock-data";
export const metadata:Metadata={title:"Thư viện ảnh",robots:{index:false,follow:false}};
export default async function AlbumPage({params}:{params:Promise<{slug:string}>}){const {slug}=await params;const album=albums.find(a=>a.slug===slug);if(!album)notFound();return <main className="gallery-page"><GalleryExperience photos={photos} albumName={album.name}/></main>}
