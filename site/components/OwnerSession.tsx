"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { request } from "./api";
type Session = { signedIn: boolean; isOwner: boolean; needsSetup: boolean; setupAllowed: boolean };
const Context = createContext<{ session: Session | null; error: string; refresh: () => Promise<void> }>({ session: null, error: "", refresh: async () => {} });
export function OwnerSession({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try { setSession(await request<Session>("/api/session")); setError(""); }
    catch (error) { setError(error instanceof Error ? error.message : "身份读取失败"); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  return <Context.Provider value={{ session, error, refresh }}>{children}</Context.Provider>;
}
export function useOwnerSession() { return useContext(Context); }
