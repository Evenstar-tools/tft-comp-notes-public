import type { Team } from "@/domain/types";

const draftKey = "tft-s19-unsynced-team-v1";
const legacyKey = "tft-owner-legacy-draft-v1";

type OwnerDraft = { kind: "saved"; teamId: string } | { kind: "edited"; team: Team };
type Recovery = { resume?: Team; restore?: Team; legacy?: Team };

export function readOwnerDraft(storage: Storage, saved: Team[] | null): Recovery {
  const raw = storage.getItem(draftKey);
  const legacyRaw = storage.getItem(legacyKey);
  const recovery: Recovery = legacyRaw ? { legacy: JSON.parse(legacyRaw) as Team } : {};
  const record = raw ? JSON.parse(raw) as Team | OwnerDraft : null;
  if (!record || typeof record !== "object") return recovery;

  if ("kind" in record && record.kind === "saved") {
    const latest = saved?.find(team => team.id === record.teamId);
    return latest ? { ...recovery, resume: latest } : recovery;
  }
  const draft = "kind" in record ? record.team : record;
  if (!draft || typeof draft.id !== "string") return recovery;
  const latest = saved?.find(team => team.id === draft.id);
  if (latest && JSON.stringify({ ...draft, revision: latest.revision, updatedAt: latest.updatedAt }) === JSON.stringify(latest)) {
    return { ...recovery, resume: latest };
  }
  if (!("kind" in record) && draft.revision > 0) {
    if (!saved) return recovery;
    if (latest && latest.revision > draft.revision) {
      // The old format did not record whether this copy had been saved.
      storage.setItem(legacyKey, JSON.stringify(draft));
      return { resume: latest, legacy: draft };
    }
  }
  return { ...recovery, restore: draft };
}

export function writeOwnerDraft(storage: Storage, team: Team | null, dirty: boolean) {
  if (team === null) {
    storage.removeItem(draftKey);
    return;
  }
  const record: OwnerDraft = dirty ? { kind: "edited", team } : { kind: "saved", teamId: team.id };
  storage.setItem(draftKey, JSON.stringify(record));
}
