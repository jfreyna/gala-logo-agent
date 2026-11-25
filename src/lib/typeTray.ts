import { useEffect, useState } from "react";

/**
 * Google's type classes and mood scores for every family, as Gala's server
 * reads them from Google's own tag file. The type tray filters and sorts
 * with these; nothing about fonts is listed in this app.
 */
export type TrayFamily = { family: string; classes: Record<string, number>; moods: Record<string, number>; quality: number };
export type TrayData = { categories: string[]; moods: string[]; families: TrayFamily[] };

let loaded: Promise<TrayData> | null = null;

export function useTrayData(wanted: boolean): TrayData | null {
  const [data, setData] = useState<TrayData | null>(null);
  useEffect(() => {
    if (!wanted) return;
    loaded ??= fetch("/api/fonts").then((response) => {
      if (!response.ok) throw new Error("Type data did not load.");
      return response.json() as Promise<TrayData>;
    });
    let current = true;
    loaded.then((value) => current && setData(value)).catch(() => (loaded = null));
    return () => {
      current = false;
    };
  }, [wanted]);
  return data;
}

/** The class a family belongs to most firmly: "Serif · Old Style Garalde". */
export function mainClass(family: TrayFamily): string {
  return Object.entries(family.classes).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

/** A family's three strongest moods, as the specimen card writes them: "Vintage, sincere, rugged". */
export function topMoods(family: TrayFamily): string {
  const line = Object.entries(family.moods)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name]) => name.toLowerCase())
    .join(", ");
  return line.charAt(0).toUpperCase() + line.slice(1);
}

/** The top-level groups Google files classes under: "Serif", "Sans". */
export function groupsOf(data: TrayData): string[] {
  return [...new Set(data.categories.map((category) => category.split(" · ")[0]!))];
}

/**
 * Every family in a group, sorted by how strongly Google scores it on the
 * selected moods (and how well made it is). All families are ranked; the
 * tray shows the top of the list.
 */
export function rankFamilies(data: TrayData, group: string, moods: string[]): TrayFamily[] {
  const score = (family: TrayFamily) => moods.reduce((sum, mood) => sum + (family.moods[mood] ?? 0), 0) * (0.5 + family.quality / 200);
  return data.families
    .filter((family) => group === "All" || mainClass(family).startsWith(`${group} · `))
    .sort((a, b) => score(b) - score(a) || a.family.localeCompare(b.family));
}
