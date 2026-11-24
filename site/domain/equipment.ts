import type { Item, Piece } from "./types";

type RecipeBook = ReadonlyMap<string, Item | null>;
export type EquipmentChoice = { items: string[]; result?: Item };

function pairKey(first: string, second: string) {
  return first < second ? first + "|" + second : second + "|" + first;
}

export function indexRecipes(catalog: Item[]): RecipeBook {
  const recipes = new Map<string, Item | null>();
  const parts = new Set(catalog.filter(item => item.category === "component").map(item => item.id));
  for (const item of catalog) {
    if (item.components?.length !== 2 || !item.components.every(id => parts.has(id))) continue;
    const key = pairKey(item.components[0], item.components[1]);
    // A pair with several possible outputs needs a choice before it can auto-combine.
    recipes.set(key, recipes.has(key) ? null : item);
  }
  return recipes;
}

export function equipItem(worn: string[], item: Item, recipes: RecipeBook): EquipmentChoice | null {
  if (item.category === "component") {
    for (const [index, ingredient] of worn.entries()) {
      const result = recipes.get(pairKey(ingredient, item.id));
      if (result) {
        const items = worn.slice();
        items[index] = result.id;
        return { items, result };
      }
    }
  }
  return worn.length < 3 ? { items: [...worn, item.id] } : null;
}

export function transferEquipment(
  pieces: Piece[], fromId: string, itemIndex: number, item: Item, toId: string, recipes: RecipeBook,
): Piece[] {
  if (fromId === toId) return pieces;
  const from = pieces.find(piece => piece.instanceId === fromId);
  const to = pieces.find(piece => piece.instanceId === toId);
  if (!from || !to || from.items[itemIndex] !== item.id) return pieces;
  const equipped = equipItem(to.items, item, recipes);
  if (!equipped) return pieces;
  return pieces.map(piece => {
    if (piece === from) return { ...piece, items: from.items.filter((_, index) => index !== itemIndex) };
    if (piece === to) return { ...piece, items: equipped.items };
    return piece;
  });
}

// Older drafts and imported boards can already hold both ingredients.
export function wornCombinations(worn: string[], recipes: RecipeBook) {
  const choices = new Map<string, { items: string[]; result: Item }>();
  for (const [first, ingredient] of worn.entries()) {
    for (let second = first + 1; second < worn.length; second++) {
      const result = recipes.get(pairKey(ingredient, worn[second]));
      if (!result || choices.has(result.id)) continue;
      const items = worn.slice();
      items[first] = result.id;
      items.splice(second, 1);
      choices.set(result.id, { items, result });
    }
  }
  return [...choices.values()];
}
