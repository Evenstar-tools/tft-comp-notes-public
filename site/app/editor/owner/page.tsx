import { Editor } from "@/components/Editor";
import { OwnerGate } from "@/components/OwnerGate";
import { currentOwner } from "@/server/access";
import { listTeams } from "@/server/teams";
import { editorLoadout } from "../editor-loadout";

export const metadata = { title: "站主工作区" };
export const dynamic = "force-dynamic";

export default async function OwnerEditorPage() {
  try {
    const owner = await currentOwner();
    if (owner) return <Editor ownerMode initialTeams={await listTeams(owner.userId)} {...editorLoadout} />;
  } catch {
    // The authenticated editor can retry loading the team list after hydration.
  }
  return <OwnerGate><Editor ownerMode {...editorLoadout} /></OwnerGate>;
}
