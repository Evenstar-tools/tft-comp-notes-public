import type { Publication } from "./document";
import type { PublishedBoardOverride } from "./published-board-layout";

export type RepositoryBoardRevision = {
  kind: "repository-board-revision";
  id: string;
  previousId: string;
  publishedAt: string;
  boardOverrides: PublishedBoardOverride[];
};

export type PublicationRecord = Publication | RepositoryBoardRevision;

export function isRepositoryBoardRevision(record: PublicationRecord): record is RepositoryBoardRevision {
  return "kind" in record && record.kind === "repository-board-revision";
}

export function publicationWithBoardRevision(base: Publication, { id, previousId, publishedAt, boardOverrides }: RepositoryBoardRevision): Publication {
  return { ...base, id, previousId, publishedAt: publishedAt > base.publishedAt ? publishedAt : base.publishedAt, boardOverrides };
}
