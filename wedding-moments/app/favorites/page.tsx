import { FavoritesGallery } from "@/components/favorites-gallery";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
export default async function FavoritesPage(){await requireChatGPTUser("/favorites");return <main className="gallery-page"><FavoritesGallery /></main>}
