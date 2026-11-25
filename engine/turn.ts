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
import { ask, SURE } from "./jev.ts";
import { DECLINE_LINE } from "./lines.ts";
import { recall } from "./memory.ts";
import { instructionsFor, type Prompt } from "./prompt.ts";
import type { Operation, Project, Stage, Store, StoredMessage } from "./store.ts";

/** What a stage tells the loop: stop and wait for the person, or go on to the next stage now. */
export type Outcome = "wait" | "continue";

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

  /** The conversation as the model reads it. A card is its spoken line plus a note of what it was. */
  private conversation(): Spoken[] {
    const spoken: Spoken[] = [];
    for (const message of this.state.messages) {
      const role = message.author === "visitor" ? "user" : "model";
      let text = message.text ?? "";
      if (message.upload !== null) text = `${text}\n[attached a reference: ${message.upload.fileName}]`.trim();
      if (message.artifact !== null) text = `${message.artifact.say ?? ""}\n[showed the ${message.kind} card]`.trim();
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

  /**
   * What the person meant, as one of a few named options. Jev decides. Null
   * when Jev is not sure enough, and then Gala answers in words instead of
   * acting.
   */
  async intent<K extends string>(text: string, options: Record<K, string>): Promise<K | null> {
    if (text.trim() === "") return null;
    const answers = await ask({
      state: { message: text },
      questions: { meaning: { type: "choice", instructions: "What does the person mean by `message`?", criteria: options } },
      signal: this.signal,
    });
    return answers.meaning.confidence >= SURE ? (answers.meaning.choice as K) : null;
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
  async converse(waitingFor: string): Promise<void> {
    const reply = await this.compose(
      () =>
        this.think<{ say: string }>({
          section: "conversation",
          task: "Reply to the person's last message.",
          facts: { step: this.stage, waitingFor },
          shape: { type: "OBJECT", properties: { say: { type: "STRING" } }, required: ["say"] },
        }),
      (value) => ({ line: value.say }),
    );
    if (reply === null) await this.decline();
    else await this.write([{ op: "say", text: reply.say }]);
  }
}

/** A short random id for an option on a card. */
export function optionId(): string {
  return Math.random().toString(36).slice(2, 10);
}
