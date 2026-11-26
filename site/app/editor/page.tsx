import { redirect } from "next/navigation";
import { Editor } from "@/components/Editor";
import { ownerEditorPath } from "@/domain/links";
import { editorLoadout } from "./editor-loadout";

export const metadata = { title: "阵容编辑器" };
export const dynamic = "force-dynamic";

export default async function EditorPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const legacyOwnerLink = typeof params.team === "string" || typeof params.copy === "string";
  if (legacyOwnerLink) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === "string") query.set(key, value);
    }
    redirect(ownerEditorPath + (query.size ? "?" + query : ""));
  }
  return <Editor {...editorLoadout} />;
}
