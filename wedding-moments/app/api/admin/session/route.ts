import { NextResponse } from "next/server";
import { adminCookie, createAdminSession, expiredAdminCookie, passwordMatches } from "@/lib/admin-session";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { password?: unknown } | null;
  if (typeof body?.password !== "string" || !(await passwordMatches(body.password))) {
    return Response.json({ error: "Mật khẩu quản trị không đúng." }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(adminCookie(await createAdminSession()));
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(expiredAdminCookie());
  return response;
}
