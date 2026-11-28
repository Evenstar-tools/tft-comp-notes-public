"use client";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ownerEditorPath } from "@/domain/links";
import { useOwnerSession } from "./OwnerSession";
import { jsonPost, request } from "./api";
import "@/app/owner-login.css";

export function OwnerGate({ children, fromSearch = false }: { children: ReactNode; fromSearch?: boolean }) {
  const { session, error: sessionError, refresh } = useOwnerSession();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const pathname = usePathname();
  const codeId = useId();

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
      if (fromSearch) window.location.assign(ownerEditorPath);
      else await refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "登录失败");
    } finally {
      setSubmitting(false);
    }
  }

  if (session?.isOwner) return <>{children}</>;
  return (
    <section className={fromSearch ? "owner-login owner-login-in-search" : "empty-state owner-login"}>
      {fromSearch ? <h2>站主登录</h2> : <h1>{pathname === "/manage" ? "发布管理" : "站主工作区"}</h1>}
      {!session ? (
        sessionError ? <button type="button" onClick={() => void refresh()}>重新读取登录状态</button> : <p>正在读取登录状态…</p>
      ) : session.loginConfigured ? (
        <form method="post" onSubmit={signIn}>
          <label htmlFor={codeId}>站主口令</label>
          <input id={codeId} name="code" type="password" autoComplete="current-password" maxLength={256} required />
          <button className="primary" type="submit" disabled={submitting}>{submitting ? "正在登录…" : "登录"}</button>
        </form>
      ) : <p>站主口令尚未配置。</p>}
      {(error || sessionError) && <p role="alert">{error || sessionError}</p>}
      {!fromSearch && <a href="/editor">返回游客编辑器</a>}
    </section>
  );
}
