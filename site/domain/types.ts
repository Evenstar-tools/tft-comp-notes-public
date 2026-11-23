export interface Trait {
  gameName?: string;
  id: string;
  name: string;
  nameEn: string;
  aliases?: string[];
  axis: "row" | "column" | "special";
  thresholds: number[];
  description: string;
  image?: string;
  dynamic?: boolean;
  provisional?: boolean;
  countMode?: "unique" | "stars";
}
export interface Unit {
  id: string;
  name: string;
  nameEn: string;
  cost: number;
  traits: string[];
  image: string;
  aliases: string[];
  ability?: string;
  abilityName?: string;
  mana?: string;
  splashImage?: string;
  imageSource?: string;
  abilitySource?: {
    label: string;
    url: string;
    updatedAt: string;
    note?: string;
  };
  sourceUnlock?: { text: string; url: string; note: string };
  unlock?: {
    text: string;
    raw: string;
    note: string;
    source?: { label: string; url: string };
    traitIds?: string[];
  };
}
export interface Item {
  id: string;
  name: string;
  image?: string;
  description: string;
  traitId?: string;
  components?: string[];
  category?: string;
  status?: string;
}
export interface Piece {
  instanceId: string;
  unitId: string;
  position: number;
  stars: 1 | 2 | 3;
  items: string[];
}
export type BoardInstrumentId = "maracas" | "rainstick";
export type BoardStage = "early" | "mid" | "late";
export interface BoardSetup {
  pieces: Piece[];
  instrumentPositions?: Partial<Record<BoardInstrumentId, number>>;
}
export interface Team extends BoardSetup {
  id: string;
  name: string;
  webTitle?: string;
  category: string;
  mainStage?: BoardStage;
  stages?: Partial<Record<"early" | "mid", BoardSetup>>;
  notes: string;
  revision: number;
  updatedAt: string;
  sectionId?: string;
  posterFormat?: "full" | "quick";
  boardRole?: "variant" | "stage";
}
export interface Season {
  id: string;
  title: string;
  sourceDate: string;
  unlockRelease?: { build: string; date: string; guideUrl: string };
  units: Unit[];
  traits: Trait[];
  items: Item[];
}
