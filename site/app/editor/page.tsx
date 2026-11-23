import { redirect } from "next/navigation";
import { Editor } from "@/components/Editor";
import { editorLoadout } from "./editor-loadout";

export const metadata = { title: "阵容编辑器" };
export const dynamic = "force-dynamic";

export default async function EditorPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  if (typeof params.team === "string" || typeof params.copy === "string") {
    const query = new URLSearchParams();
    for (const key of ["team", "copy", "publication", "section"] as const) {
      if (typeof params[key] === "string") query.set(key, params[key]);
    }
    redirect("/editor/owner?" + query);
  }
  return <Editor {...editorLoadout} />;
}
