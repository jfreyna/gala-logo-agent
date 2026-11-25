/**
 * Gala's prompt: the persona, one instruction per step of the work, and the
 * hall rules.
 *
 * The real text is withheld. It is not in this repository and is never
 * written to disk on the server. At boot the server asks Gala's storage for
 * it over one authenticated route and keeps the answer in memory, here.
 * When there is no secret or no stored prompt (a fresh clone, a test), the
 * short stand-in in standin-prompt.ts is used instead, so the code runs.
 *
 * Only this module and guard.ts ever hold the text. Nothing returns it to a
 * browser: callers get `instructionsFor`, which goes to the model as the
 * system instruction and nowhere else.
 */
import { config } from "./config.ts";
import { buildGuard, type Guard } from "./guard.ts";
import { STAND_IN_PROMPT } from "./standin-prompt.ts";

export type Prompt = {
  source: "storage" | "stand-in";
  sections: Map<string, string>;
  guard: Guard;
};

/**
 * The prompt is one document. A line that starts with "@@ " opens a
 * section, and the rest of that line is its name: "@@ persona",
 * "@@ brief", "@@ halls".
 */
export function parseSections(text: string): Map<string, string> {
  const sections = new Map<string, string>();
  let name: string | null = null;
  let lines: string[] = [];
  const close = () => {
    if (name !== null) sections.set(name, lines.join("\n").trim());
  };
  for (const line of text.split("\n")) {
    if (line.startsWith("@@ ")) {
      close();
      name = line.slice(3).trim();
      lines = [];
    } else {
      lines.push(line);
    }
  }
  close();
  return sections;
}

export function makePrompt(text: string, source: Prompt["source"]): Prompt {
  const sections = parseSections(text);
  if (!sections.has("persona")) throw new Error("The prompt has no persona section.");
  // The stand-in is public, so its text is not guarded; see guard.ts.
  const guard = buildGuard(source === "storage" ? text : "", STAND_IN_PROMPT);
  return { source, sections, guard };
}

/** Fetches the prompt from storage, or falls back to the stand-in. */
export async function loadPrompt(): Promise<Prompt> {
  const secret = config.serverSecret;
  if (secret !== null) {
    try {
      const response = await fetch(`${config.storageUrl}/engine/prompt`, { method: "POST", headers: { "x-gala-server": secret }, signal: AbortSignal.timeout(20_000) });
      if (response.ok) return makePrompt(((await response.json()) as { prompt: string }).prompt, "storage");
      console.warn(`Prompt not loaded from storage (HTTP ${response.status}); using the stand-in.`);
    } catch {
      console.warn("Prompt not loaded from storage (no answer); using the stand-in.");
    }
  }
  return makePrompt(STAND_IN_PROMPT, "stand-in");
}

/** The system instruction for one step: who Gala is, then what this step asks. */
export function instructionsFor(prompt: Prompt, section: string): string {
  const step = prompt.sections.get(section);
  if (step === undefined) throw new Error(`The prompt has no "${section}" section.`);
  return `${prompt.sections.get("persona")}\n\n${step}`;
}

/** Every section name the engine asks for. A prompt missing one is refused at boot. */
export const SECTIONS = ["persona", "brief", "research", "type", "directions", "variations", "stressTest", "colors", "colorways", "kit", "picks", "conversation", "memory"] as const;

export function assertComplete(prompt: Prompt): void {
  const missing = SECTIONS.filter((name) => !prompt.sections.has(name));
  if (missing.length > 0) throw new Error(`The prompt is missing sections: ${missing.join(", ")}`);
}
