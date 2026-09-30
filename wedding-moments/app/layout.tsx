import type { Metadata } from "next";
import "./globals.css";
import "./gallery-admin.css";
export const metadata: Metadata={title:{default:"Văn Thọ & Hồng Thắm — Thư viện ảnh",template:"%s — Văn Thọ & Hồng Thắm"},description:"Thư viện khoảnh khắc cưới của Văn Thọ và Hồng Thắm.",robots:{index:false,follow:false},icons:{icon:"/favicon.svg",shortcut:"/favicon.svg"}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="vi"><body className="antialiased">{children}</body></html>}
