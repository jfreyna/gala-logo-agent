/**
 * One turn: Gala's work on one project, from the moment the person did
 * something to the moment Gala needs them again.
 *
 * A stage module gets a Turn and uses it for everything: reading the
 * project, asking the model, and writing. Writing goes through `say` and
 * `show`, and both run the prompt-protection checks first. There is no
 * other way for a stage to put words in front of a person.
 */
import { fill, type Image, type Shape, type Spoken } from "./gemini.ts";
import { checkReply, describeVerdict, type Shown } from "./guard.ts";
import { DECLINE_LINE } from "./lines.ts";
import { recall } from "./memory.ts";
import { instructionsFor, type Prompt } from "./prompt.ts";
import { STEPS, stepIndex, stepIndexOfKind } from "./steps.ts";
import type { Operation, Project, Stage, Store, StoredMessage } from "./store.ts";

/** What a stage tells the loop: stop and wait for the person, or go on to the next stage now. */
export type Outcome = "wait" | "continue";

/**
 * The particulars of what a person asked for, read from their message and
 * checked against what is real (steer.ts). Each is null when not asked.
 */
export type Request = {
  /** A Google family, by its exact name on Google's list. */
  typeface: string | null;
  /** How the name is written: the brand's own name in another case, like "GALA". */
  nameAs: string | null;
  /** What to change or try in the drawing, in the person's own words. */
  drawing: string | null;
  /** Any other change to the step's work, in the person's own words. */
  note: string | null;
};

/**
 * What steering decided the current step should do with the person's
 * message. A pick or a plain "go back" is already done when the step runs,
 * so it leaves nothing here.
 */
export type Steering =
  /** Do the step's work again, with what the person asked for. */
  | { act: "redo"; request: Request }
  /** Something was unclear: Gala asks one short question, and nothing moves. */
  | { act: "ask"; facts?: Record<string, unknown> }
  /** Nothing to act on: Gala answers in words, and the work stays where it is. */
  | { act: "talk"; facts?: Record<string, unknown> }
  /** The person asked for something that belongs to a later step. It is kept for that step, and the work stays where it is. */
  | { act: "held"; step: Stage; idea: string }
  /** At the symbol opener, the person clearly asked for a logo with no symbol. */
  | { act: "noSymbol" };

export class Turn {
  state!: Project;
  readonly store: Store;
  readonly prompt: Prompt;
  readonly signal: AbortSignal;

  constructor(store: Store, prompt: Prompt, signal: AbortSignal) {
    this.store = store;
    this.prompt = prompt;
    this.signal = signal;
  }

  private opened = false;

  /** Opens the turn, or refreshes what it knows after a write. False when another turn is running. */
  async read(): Promise<boolean> {
    const state = this.opened ? await this.store.read() : await this.store.begin();
    if (state === "busy") return false;
    this.opened = true;
    this.state = state;
    return true;
  }

  get stage(): Stage {
    return this.state.project.stage;
  }

  get brand(): string {
    return this.state.project.brandName;
  }

  /** The newest card of a kind, or null. */
  latest(kind: string): StoredMessage | null {
    return this.state.messages.findLast((message) => message.kind === kind) ?? null;
  }

  /**
   * The current card of a kind, or null. A card is current only if no card
   * of an earlier step came after it; once a person goes back, every later
   * card is history. It stays in the conversation and is never deleted.
   */
  current(kind: string): StoredMessage | null {
    const card = this.latest(kind);
    return card !== null && this.isLive(card) ? card : null;
  }

  /** False when a card of an earlier step came after this one. */
  isLive(card: StoredMessage): boolean {
    const step = stepIndexOfKind(card.kind);
    if (step < 0) return true;
    const at = this.state.messages.indexOf(card);
    return !this.state.messages.slice(at + 1).some((later) => {
      const laterStep = stepIndexOfKind(later.kind);
      return later.author === "gala" && laterStep >= 0 && laterStep < step;
    });
  }

  /** The name as the person had it written before the wordmark step: as asked on the type card ("GALA"), or the brand's name. */
  get nameAsTyped(): string {
    return this.latest("typeSet")?.artifact?.nameAs ?? this.brand;
  }

  /** How the name is set in type: as the wordmark card sets it (its case applied), or as typed. */
  get nameAsSet(): string {
    return this.current("wordmark")?.artifact?.brandName ?? this.nameAsTyped;
  }

  /** True when the person explicitly asked for a logo with no symbol: the name alone is the logo. */
  get nameOnly(): boolean {
    return this.current("symbolOpener")?.artifact?.answered === "noSymbol";
  }

  /** What the person asked for ahead of time, kept for any of these steps, oldest first. */
  heldFor(...steps: Stage[]): string[] {
    return [...new Set(this.state.held.filter((idea) => steps.includes(idea.step)).map((idea) => idea.text))];
  }

  /**
   * What the person asked to change in the drawing, from every card that is
   * not history: each request is written onto the card it was said about,
   * and handed to every drawing from then on, not only the next one.
   */
  drawingRequests(): string[] {
    const asked = this.state.messages.filter((message) => message.artifact !== null && Array.isArray(message.artifact.requests) && this.isLive(message)).flatMap((message) => message.artifact!.requests as string[]);
    return [...new Set(asked)];
  }

  /** The person's message this turn, as steering read it. Empty when they pressed a button and said nothing. */
  said = "";

  private steering: Steering | null = null;

  /** Set by steering before the step runs. */
  steer(next: Steering | null): void {
    this.steering = next;
  }

  /** What steering left for the step. Taken once, so a later step in the same turn can't act on it again. */
  take(): Steering | null {
    const next = this.steering;
    this.steering = null;
    return next;
  }

  /** True when card `a` came after card `b` (or `b` does not exist). */
  isNewer(a: StoredMessage | null, b: StoredMessage | null): boolean {
    if (a === null) return false;
    if (b === null) return true;
    return this.state.messages.indexOf(a) > this.state.messages.indexOf(b);
  }

  /** What the person has said since Gala last spoke. */
  unanswered(): StoredMessage[] {
    const lastGala = this.state.messages.findLastIndex((message) => message.author === "gala");
    return this.state.messages.slice(lastGala + 1).filter((message) => message.author === "visitor");
  }

  unansweredText(): string {
    return this.unanswered()
      .map((message) => message.text ?? "")
      .filter((text) => text !== "")
      .join("\n");
  }

  /** Reference images the person attached since Gala last spoke. */
  async attachedImages(): Promise<Image[]> {
    const images: Image[] = [];
    for (const message of this.unanswered()) {
      if (message.upload === null || !message.upload.contentType.startsWith("image/")) continue;
      const file = await this.store.readFile(message.upload.fileId);
      images.push({ bytes: file.bytes, mime: file.contentType });
    }
    return images;
  }

  /**
   * The conversation as the model reads it. A card is its spoken line plus a
   * note of what it was. A button the person pressed on a card (its line in
   * the chat, convex/lib/echo.ts) is a note of what they pressed.
   */
  private conversation(): Spoken[] {
    const spoken: Spoken[] = [];
    for (const message of this.state.messages) {
      const role = message.author === "visitor" ? "user" : "model";
      let text = message.text ?? "";
      if (message.upload !== null) text = `${text}\n[attached a reference: ${message.upload.fileName}]`.trim();
      if (message.kind === "action" && message.author === "visitor") text = typeof message.artifact?.sent === "string" ? `[pressed a button on the card: ${message.artifact.sent}]` : "";
      else if (message.artifact !== null) text = `${message.artifact.say ?? ""}\n[showed the ${message.kind} card]`.trim();
      if (text === "") continue;
      const previous = spoken[spoken.length - 1];
      if (previous !== undefined && previous.role === role) previous.text += `\n${text}`;
      else spoken.push({ role, text });
    }
    return spoken;
  }

  /**
   * Asks the text model to fill in `shape` for one step. The step's
   * instruction comes from the prompt; `task` and `facts` are this
   * project's particulars.
   */
  async think<T>(options: { section: string; task: string; facts: Record<string, unknown>; shape: Shape; images?: Image[]; search?: boolean }): Promise<T> {
    const conversation = this.conversation();
    const facts = { ...options.facts, whatIRememberAboutThisPerson: recall(this.state) };
    const request: Spoken = { role: "user", text: `FACTS\n${JSON.stringify(facts)}\n\nTASK\n${options.task}`, images: options.images };
    const last = conversation[conversation.length - 1];
    if (last !== undefined && last.role === "user") {
      last.text += `\n\n${request.text}`;
      last.images = request.images;
    } else {
      conversation.push(request);
    }
    return fill<T>({
      instructions: instructionsFor(this.prompt, options.section),
      conversation,
      shape: options.shape,
      search: options.search,
      signal: this.signal,
    });
  }

  /** The "working" line the studio shows while a step runs. */
  async status(text: string): Promise<void> {
    await this.store.write([{ op: "status", text }]);
  }

  /**
   * True when this may be shown. A held-back reply is logged by the name of
   * the check and its score; the words themselves are never logged.
   */
  async mayShow(shown: Shown): Promise<boolean> {
    const verdict = await checkReply(this.prompt.guard, shown, this.signal);
    if (verdict.held) console.warn(describeVerdict(verdict));
    return !verdict.held;
  }

  /**
   * Builds something to show, checks its words, and builds it once more if
   * the check fails. Null when both tries fail.
   */
  async compose<T>(make: () => Promise<T>, shownIn: (value: T) => Shown, alsoRequire?: (value: T) => Promise<boolean> | boolean): Promise<T | null> {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const value = await make();
      if ((await this.mayShow(shownIn(value))) && (alsoRequire === undefined || (await alsoRequire(value)))) return value;
    }
    return null;
  }

  /** Writes operations and refreshes what the turn knows. */
  async write(operations: Operation[]): Promise<void> {
    await this.store.write(operations);
    await this.read();
  }

  /** Gala says a line. A line that fails the checks is replaced by the decline. */
  async say(text: string): Promise<void> {
    await this.write([{ op: "say", text: (await this.mayShow({ line: text })) ? text : DECLINE_LINE }]);
  }

  /** The decline, when nothing checked could be produced. */
  async decline(): Promise<void> {
    await this.write([{ op: "say", text: DECLINE_LINE }]);
  }

  /** A short spoken reply that leaves the work where it is. */
  async converse(waitingFor: string, options: { task?: string; facts?: Record<string, unknown> } = {}): Promise<void> {
    const reply = await this.compose(
      () =>
        this.think<{ say: string }>({
          section: "conversation",
          task: options.task ?? "Reply to the person's last message.",
          facts: { step: this.stage, waitingFor, ...options.facts },
          shape: { type: "OBJECT", properties: { say: { type: "STRING" } }, required: ["say"] },
        }),
      (value) => ({ line: value.say }),
    );
    if (reply === null) await this.decline();
    else await this.write([{ op: "say", text: reply.say }]);
  }

  /**
   * Gala's answer when steering moved nothing: one short question when
   * unsure, a reply in words, or, for a request kept for a later step,
   * where the project is and what comes next.
   */
  async answer(next: Steering, waitingFor: string): Promise<void> {
    if (next.act === "held") {
      const at = stepIndex(this.stage);
      await this.converse(waitingFor, {
        task: "The person asked for something that belongs to a later step. Say you have kept it for that step, without doing it now. Then say which step the project is on and which step comes next, and ask for what this step is waiting for.",
        facts: { keptForStep: STEPS[stepIndex(next.step)]!.name, whatWasKept: next.idea, currentStep: STEPS[at]!.name, nextStep: STEPS[at + 1]?.name ?? null },
      });
    } else if (next.act === "ask") {
      await this.converse(waitingFor, {
        task: "You are not sure what the person wants. Ask them one short question to find out, and change nothing.",
        facts: next.facts,
      });
    } else {
      await this.converse(waitingFor, { facts: next.act === "talk" ? next.facts : undefined });
    }
  }
}

/** What the person asked for, as a step's facts carry it. Null when nothing. */
export function asked(request: Request | null): string[] | null {
  if (request === null) return null;
  const said = [request.drawing, request.note].filter((entry): entry is string => entry !== null);
  return said.length > 0 ? said : null;
}

/** The drawing request, written onto the card made in answer to it. */
export function requestsOf(request: Request | null): { requests?: string[] } {
  return request?.drawing ? { requests: [request.drawing] } : {};
}

/** A short random id for an option on a card. */
export function optionId(): string {
  return Math.random().toString(36).slice(2, 10);
}
