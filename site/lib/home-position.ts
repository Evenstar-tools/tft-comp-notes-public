const homeCardPrefix = "guide-card-";
const cardFragment = /^#guide-card-([\w-]+)(?:~([\w-]+))?$/;

export function homeGuideReturn(home: string, cardId: string, boardId?: string) {
  return `${home}#${homeCardPrefix}${cardId}${boardId ? `~${boardId}` : ""}`;
}

export function homeCardTarget(hash: string) {
  const match = cardFragment.exec(hash);
  return match ? { card: homeCardPrefix + match[1], board: match[2] } : undefined;
}

export function validHomeReturn(value: unknown) {
  if (typeof value !== "string" || value.length > 1024 || !/^\/(?:find)?(?:[?#]|$)/.test(value) || /[\r\n\t\\]/.test(value)) return;
  const url = new URL(value, "https://tft.local");
  if ((url.pathname === "/" || url.pathname === "/find") && (!url.hash || homeCardTarget(url.hash))) return value;
}
