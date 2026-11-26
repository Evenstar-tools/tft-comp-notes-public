import { Editor } from "@/components/Editor";
import { OwnerGate } from "@/components/OwnerGate";
import { currentOwner, databaseConfigured } from "@/server/access";
import { listTeams } from "@/server/teams";
import { editorLoadout } from "../editor-loadout";

export const metadata = { title: "站主工作区" };
export const dynamic = "force-dynamic";

export default async function OwnerEditorPage() {
  if (!databaseConfigured()) {
    return <OwnerGate>
      <p className="notice">云端数据库尚未配置，当前改动保存至本机浏览器。配置 DATABASE_URL 后自动开启云端保存与原盘发布。</p>
      <Editor {...editorLoadout} />
    </OwnerGate>;
  }
  try {
    const owner = await currentOwner();
    if (owner) return <Editor ownerMode initialTeams={await listTeams(owner.userId)} {...editorLoadout} />;
  } catch {
    // The authenticated editor can retry loading the team list after hydration.
  }
  return <OwnerGate><Editor ownerMode {...editorLoadout} /></OwnerGate>;
}
