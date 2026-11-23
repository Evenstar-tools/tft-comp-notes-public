import type { Season, Team } from "./types";
export interface RichElement {
  text_run?: {
    content: string;
    text_element_style?: {
      bold?: boolean;
      italic?: boolean;
      underline?: boolean;
      strikethrough?: boolean;
      link?: { url: string };
    };
  };
  mention_doc?: { title: string; url: string };
  [key: string]: unknown;
}
export interface ContentBlock {
  id: string;
  type:
    | "text"
    | "heading"
    | "bullet"
    | "ordered"
    | "quote"
    | "code"
    | "image"
    | "columns"
    | "column"
    | "table"
    | "cell"
    | "divider"
    | "unsupported";
  elements?: RichElement[];
  text?: string;
  level?: number;
  label?: true;
  imageToken?: string;
  children?: ContentBlock[];
  columnCount?: number;
}
export interface Section {
  id: string;
  title: string;
  category: string;
  updateEdition?: string;
  blocks: ContentBlock[];
  team?: Team;
  teams?: Team[];
  primaryTeamId?: string;
  stageTeamIds?: string[];
  summaryBlockId?: string;
  generatedRegions?: Record<string, { textId: string; imageId: string }>;
  reroll?: {
    entryTeamId?: string;
    stages: { teamId: string; name: string; notes: string; boardRole?: Team["boardRole"]; parentTeamId?: string; equivalentStageId?: string; roles?: { label: string; units: string[] }[] }[];
    advice: Record<string, string>;
    added: string[];
    corrected: string[];
  };
  kind?: "guide" | "note" | "category";
  sourceHeadingIds?: string[];
  gameData?: Season;
}
export interface DocumentDraft {
  id: string;
  title: string;
  revision: number;
  syncedAt: string;
  sections: Section[];
  media: string[];
  warnings: string[];
  sectionIssues?: { sections: string[]; message: string }[];
  season: Season;
}
export interface Publication extends DocumentDraft {
  publishedAt: string;
  previousId?: string;
}
