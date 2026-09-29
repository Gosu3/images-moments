import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("admin dashboard uses password-session login and exposes logout", () => {
  const dashboard = fs.readFileSync("components/admin-dashboard.tsx", "utf8");
  assert.doesNotMatch(dashboard, /signin-with-chatgpt/);
  assert.match(dashboard, /fetch\("\/api\/admin\/session", \{ method: "DELETE" \}\)/);
  assert.match(dashboard, /router\.replace\("\/admin\/login"\)/);
  assert.match(dashboard, /"Đăng xuất"/);
  assert.match(dashboard, /\/admin\/login\?return_to=%2Fadmin/);
});

test("admin session route expires the cookie on DELETE", () => {
  const route = fs.readFileSync("app/api/admin/session/route.ts", "utf8");
  assert.match(route, /export async function DELETE/);
  assert.match(route, /expiredAdminCookie/);
});
