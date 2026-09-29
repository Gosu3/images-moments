import type { Metadata } from "next";
import "./globals.css";
import "./gallery-admin.css";
export const metadata: Metadata={title:{default:"Minh Anh & Hoàng Nam — Wedding Moments",template:"%s — Wedding Moments"},description:"Thư viện khoảnh khắc cưới của Minh Anh và Hoàng Nam.",robots:{index:false,follow:false},icons:{icon:"/favicon.svg",shortcut:"/favicon.svg"}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="vi"><body className="antialiased">{children}</body></html>}
