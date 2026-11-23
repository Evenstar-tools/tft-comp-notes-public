import { OwnerGate } from "@/components/OwnerGate";
import { PublicationManager } from "@/components/PublicationManager";
import { currentOwner } from "@/server/access";
export const metadata = { title: "发布管理" };
export const dynamic = "force-dynamic";
export default async function Manage() {
  if (await currentOwner()) return <PublicationManager />;
  return (
    <OwnerGate>
      <PublicationManager />
    </OwnerGate>
  );
}
