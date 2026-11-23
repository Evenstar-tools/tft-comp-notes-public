"use client";
import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useOwnerSession } from "./OwnerSession";
import { request } from "./api";

export function OwnerGate({ children }: { children: React.ReactNode }) {
  const { session, error: sessionError, refresh } = useOwnerSession();
  const [error, setError] = useState("");
  const pathname = usePathname();
  const search = useSearchParams();
  const returnTo = (pathname || "/editor") + (search.toString() ? "?" + search.toString() : "");
  async function bind() {
    try {
      await request("/api/session", { method: "POST" });
      await refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "绑定失败");
    }
  }
  if (session?.isOwner) return <>{children}</>;
  return (
    <section className="empty-state">
      <h1>{pathname === "/manage" ? "发布管理" : "阵容编辑器"}</h1>
      {(error || sessionError) && <p role="alert">{error || sessionError}</p>}
      {!session ? (
        <div>{sessionError ? <button onClick={() => void refresh()}>重新读取身份</button> : <p>正在读取身份…</p>}</div>
      ) : !session.signedIn ? (
        <a
          className="button primary"
          href={"/signin-with-chatgpt?return_to=" + encodeURIComponent(returnTo)}
          target="_top"
        >
          登录站主账号
        </a>
      ) : session.needsSetup && session.setupAllowed ? (
        <button className="primary" onClick={bind}>
          将当前账号绑定为站主
        </button>
      ) : (
        <p>
          {session.needsSetup ? "站主绑定尚未配置。" : "当前账号没有编辑权限。"}
        </p>
      )}
    </section>
  );
}
