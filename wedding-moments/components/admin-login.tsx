"use client";

import { FormEvent, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import styles from "./admin-login.module.css";

export function AdminLogin() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    const response = await fetch("/api/admin/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) { setError(result.error || "Không thể đăng nhập."); setBusy(false); return; }
    window.location.assign("/admin");
  }
  return <main className={`access-page ${styles.page}`}><section className={styles.panel}>
    <p className="couple-name">Văn Thọ &amp; Hồng Thắm</p><h1 className={styles.title}>Đăng nhập quản trị</h1>
    <p>Nhập mật khẩu quản trị để tải và quản lý ảnh.</p>
    <form className={styles.form} onSubmit={submit}>
      <label htmlFor="admin-password">Mật khẩu</label>
      <div className={styles.passwordField}>
        <input id="admin-password" className={styles.passwordInput} name="password" type={showPassword ? "text" : "password"} minLength={12} required autoComplete="current-password" autoFocus />
        <button className={styles.passwordToggle} type="button" aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"} aria-pressed={showPassword} aria-controls="admin-password" onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
      </div>
      {error && <p role="alert">{error}</p>}
      <button className={styles.submit} disabled={busy}>{busy ? "Đang đăng nhập…" : "Đăng nhập"}</button>
    </form>
  </section></main>;
}
