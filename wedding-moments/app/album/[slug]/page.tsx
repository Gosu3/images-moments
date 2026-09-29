import type { Metadata } from "next";
import { LibraryAlbumGallery } from "@/components/library-album-gallery";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
export const metadata:Metadata={title:"Thư viện ảnh",robots:{index:false,follow:false}};
export default async function AlbumPage({params}:{params:Promise<{slug:string}>}){const {slug}=await params;await requireChatGPTUser(`/album/${encodeURIComponent(slug)}`);return <main className="gallery-page"><LibraryAlbumGallery slug={slug}/></main>}
