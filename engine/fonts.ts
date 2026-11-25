/**
 * Typefaces, from Google's own tag file.
 *
 * Google publishes, for every family on Google Fonts, the classes it
 * belongs to ("/Serif/Old Style Garalde") and scored mood tags
 * ("/Expressive/Calm", 0 to 100). Gala chooses type only from that file.
 * There is no list of fonts, classes or moods in this repository: the
 * group names below are the file's own column vocabulary.
 */

const TAGS_URL = "https://raw.githubusercontent.com/google/fonts/main/tags/all/families.csv";

/** The tag groups that name a letterform class. */
const CLASS_GROUPS = new Set(["Serif", "Sans", "Slab", "Script", "Theme", "Monospace"]);
/** The tag group that scores mood. */
const MOOD_GROUP = "Expressive";
/** The tag group that scores how well a family is made. */
const QUALITY_GROUP = "Quality";

export type Family = {
  family: string;
  /** Class tag to how strongly the family belongs to it, 0 to 100. */
  classes: Record<string, number>;
  /** Mood to score, 0 to 100. */
  moods: Record<string, number>;
  /** Average of Google's quality scores, 0 to 100; 50 when the family has none. */
  quality: number;
};

export type FontData = {
  families: Family[];
  /** Every class in the file, as "Serif / Old Style Garalde". */
  classes: string[];
  /** Every mood in the file, as "Calm". */
  moods: string[];
};

/** Reads one CSV line; family names can be quoted and contain commas. */
function cells(line: string): string[] {
  const result: string[] = [];
  let cell = "";
  let quoted = false;
  for (const character of line) {
    if (character === '"') quoted = !quoted;
    else if (character === "," && !quoted) {
      result.push(cell);
      cell = "";
    } else cell += character;
  }
  result.push(cell);
  return result;
}

export function parseTags(csv: string): FontData {
  const byName = new Map<string, Family & { qualities: number[] }>();
  const classes = new Set<string>();
  const moods = new Set<string>();
  for (const line of csv.split("\n")) {
    const row = cells(line.trim());
    if (row.length < 4) continue;
    const [family, , tag, scoreText] = row as [string, string, string, string];
    const score = Number(scoreText);
    const [, group, name] = tag.split("/");
    if (!family || !group || !name || !Number.isFinite(score)) continue;
    let entry = byName.get(family);
    if (entry === undefined) {
      entry = { family, classes: {}, moods: {}, quality: 50, qualities: [] };
      byName.set(family, entry);
    }
    if (CLASS_GROUPS.has(group)) {
      const label = `${group} / ${name}`;
      entry.classes[label] = score;
      classes.add(label);
    } else if (group === MOOD_GROUP) {
      entry.moods[name] = score;
      moods.add(name);
    } else if (group === QUALITY_GROUP) {
      entry.qualities.push(score);
    }
  }
  const families = [...byName.values()].map(({ qualities, ...family }) => ({
    ...family,
    quality: qualities.length > 0 ? qualities.reduce((sum, value) => sum + value, 0) / qualities.length : 50,
  }));
  return { families, classes: [...classes].sort(), moods: [...moods].sort() };
}

let loaded: Promise<FontData> | null = null;

/** Google's tag file, fetched once per server start and kept in memory. */
export function fontData(): Promise<FontData> {
  loaded ??= fetch(TAGS_URL, { signal: AbortSignal.timeout(30_000) })
    .then((response) => {
      if (!response.ok) throw new Error(`Google's font tags did not load (HTTP ${response.status})`);
      return response.text();
    })
    .then(parseTags)
    .catch((error) => {
      loaded = null;
      throw error;
    });
  return loaded;
}

/**
 * How well a family fits a brief: its mood scores weighted by how much the
 * brief wants each mood, scaled by how firmly it belongs to the class and
 * how well it is made.
 */
export function fit(family: Family, typeClass: string, moodWeights: Record<string, number>): number {
  let mood = 0;
  let total = 0;
  for (const [name, weight] of Object.entries(moodWeights)) {
    mood += weight * ((family.moods[name] ?? 0) / 100);
    total += weight;
  }
  const moodFit = total > 0 ? mood / total : 0;
  return moodFit * ((family.classes[typeClass] ?? 0) / 100) * (0.5 + family.quality / 200);
}

/** Every family in a class, best fit first. Nothing is cut before it is ranked. */
export function rank(data: FontData, typeClass: string, moodWeights: Record<string, number>): Family[] {
  return data.families
    .filter((family) => (family.classes[typeClass] ?? 0) > 0)
    .sort((a, b) => fit(b, typeClass, moodWeights) - fit(a, typeClass, moodWeights) || a.family.localeCompare(b.family));
}

/** "Serif / Old Style Garalde" as the specimen card writes it: "Serif · Old Style Garalde". */
export function classLabel(typeClass: string): string {
  return typeClass.replace(" / ", " · ");
}

/** A family's three strongest moods, as the card writes them: "Vintage, sincere, rugged". */
export function topMoods(family: Family): string {
  const names = Object.entries(family.moods)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name]) => name.toLowerCase());
  const line = names.join(", ");
  return line.charAt(0).toUpperCase() + line.slice(1);
}
