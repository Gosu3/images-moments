import type { Metadata } from "next";
import { LibraryAlbumGallery } from "@/components/library-album-gallery";
export const metadata:Metadata={title:"Thư viện ảnh",robots:{index:false,follow:false}};
export default async function AlbumPage({params}:{params:Promise<{slug:string}>}){const {slug}=await params;return <main className="gallery-page"><LibraryAlbumGallery slug={slug}/></main>}
