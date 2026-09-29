import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isVercelAdmin } from "@/lib/admin-session";
import { AdminLogin } from "@/components/admin-login";

export const metadata: Metadata = { title: "Đăng nhập quản trị", robots: { index: false, follow: false } };

export default async function AdminLoginPage() {
  if (process.env.VERCEL && await isVercelAdmin()) redirect("/admin");
  return <AdminLogin />;
}
