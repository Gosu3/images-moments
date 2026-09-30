import type { Metadata } from "next";
import "./globals.css";
import "./gallery-admin.css";
import { ReadyDownload } from "@/components/ready-download";
export const metadata: Metadata={title:{default:"Văn Thọ & Hồng Thắm — Thư viện ảnh",template:"%s — Văn Thọ & Hồng Thắm"},description:"Thư viện khoảnh khắc cưới của Văn Thọ và Hồng Thắm.",robots:{index:false,follow:false},icons:{icon:[{url:"/favicon.ico?v=tho-tham-2",sizes:"16x16 32x32 48x48 64x64",type:"image/x-icon"},{url:"/favicon.png?v=tho-tham-2",sizes:"192x192",type:"image/png"}],shortcut:"/favicon.ico?v=tho-tham-2",apple:{url:"/apple-touch-icon.png?v=tho-tham-2",sizes:"180x180",type:"image/png"}}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="vi"><body className="antialiased">{children}<ReadyDownload /></body></html>}
