"use client";
import { useState, type FormEvent, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useOwnerSession } from "./OwnerSession";
import { jsonPost, request } from "./api";
import "@/app/owner-login.css";

export function OwnerGate({ children }: { children: ReactNode }) {
  const { session, error: sessionError, refresh } = useOwnerSession();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const pathname = usePathname();

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const form = event.currentTarget;
    const code = new FormData(form).get("code");
    setSubmitting(true);
    setError("");
    try {
      await request("/api/session", jsonPost({ code }));
      form.reset();
      await refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "登录失败");
    } finally {
      setSubmitting(false);
    }
  }

  if (session?.isOwner) return <>{children}</>;
  return (
    <section className="empty-state owner-login">
      <h1>{pathname === "/manage" ? "发布管理" : "站主工作区"}</h1>
      {!session ? (
        sessionError ? <button type="button" onClick={() => void refresh()}>重新读取登录状态</button> : <p>正在读取登录状态…</p>
      ) : session.loginConfigured ? (
        <form onSubmit={signIn}>
          <label htmlFor="owner-access-code">站主口令</label>
          <input id="owner-access-code" name="code" type="password" autoComplete="current-password" maxLength={256} required />
          <button className="primary" type="submit" disabled={submitting}>{submitting ? "正在登录…" : "登录"}</button>
        </form>
      ) : <p>站主口令尚未配置。</p>}
      {(error || sessionError) && <p role="alert">{error || sessionError}</p>}
      <a href="/editor">返回游客编辑器</a>
    </section>
  );
}
