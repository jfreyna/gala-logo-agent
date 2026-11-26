/**
 * Whether an action's echo in the chat still shows Gala working on it
 * ("Sending", with the moving shapes) or has settled ("Sent").
 *
 * An echo that wakes Gala shows Sending until one of these: Gala's working
 * line appears, Gala writes anything after it, the person writes after it,
 * or the turn it asked for has ended (the project is no longer waiting on
 * Gala). The last one is what keeps an echo from showing work forever when
 * a turn ends without a reply. An action that wakes no one is Sent at once.
 *
 * No imports, so the page and the checks read this one file.
 *
 * What this does not prove: that a reply was the right one. Sent only says
 * the click was taken and the turn that followed it is over.
 */
export function echoState(options: { wakes: boolean; later: { author: string }[]; working: string | null; waitingOnGala: boolean }): "Sending" | "Sent" {
  if (!options.wakes) return "Sent";
  const answered = options.working !== null || options.later.length > 0 || !options.waitingOnGala;
  return answered ? "Sent" : "Sending";
}
