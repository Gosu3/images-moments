"use client";

import { FormEvent, useState } from "react";
import styles from "./admin-login.module.css";

export function AdminLogin() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    const response = await fetch("/api/admin/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) { setError(result.error || "Không thể đăng nhập."); setBusy(false); return; }
    window.location.assign("/admin");
  }
  return <main className="access-page"><section>
    <p className="couple-name">Văn Thọ &amp; Hồng Thắm</p><h1>Đăng nhập quản trị</h1>
    <p>Nhập mật khẩu quản trị để tải và quản lý ảnh.</p>
    <form className={styles.form} onSubmit={submit}>
      <label>Mật khẩu<input name="password" type="password" minLength={12} required autoComplete="current-password" autoFocus /></label>
      {error && <p role="alert">{error}</p>}
      <button disabled={busy}>{busy ? "Đang đăng nhập…" : "Đăng nhập"}</button>
    </form>
  </section></main>;
}
