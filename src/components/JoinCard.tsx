import { useEffect, useState, type FormEvent } from "react";
import { GoogleButton } from "./Buttons";
import { LineField } from "./LineField";
import { PrimaryButton } from "./Buttons";
import { signInWithEmail } from "../lib/auth";
import { config } from "../lib/config";
import { continueWithGoogle, looksLikeEmail, requestJoinLink } from "../lib/join";
import mail from "../assets/icons/mail.svg";
import spinner from "../assets/icons/spinner.svg";
import checkCircleLight from "../assets/icons/check-circle-light.svg";
import checkCircleDark from "../assets/icons/check-circle-dark.svg";

/**
 * gala-join-card (Figma 5557:10010): Gala's sign-up and sign-in card.
 *
 * Signing up: an email field with a round send button, an Or divider,
 * Frilly's Google button, the sign-in line, and the Frilly-account note.
 * States: Default, Sending, Error, Sent, Send failed, Resent.
 *
 * Signing in, for people who already have a Frilly account: email and
 * password, "Forgot password?", and the way back to signing up. States:
 * Sign in, Signing in, Sign-in error, each with the optional "Password
 * set" line shown to someone arriving from setting their password.
 */
type State =
  | { name: "default" }
  | { name: "sending" }
  | { name: "error" }
  | { name: "sendFailed" }
  | { name: "sent" }
  | { name: "resent"; secondsLeft: number }
  | { name: "signIn" }
  | { name: "signingIn" }
  | { name: "signInError" };

/** Where the card starts. The front page opens it on Sign in for `?signin=1`. */
export type JoinCardStart = { state: "signIn" | "signingIn" | "signInError"; passwordSet?: boolean; email?: string; password?: string };

/** How long after a resend before another can be asked for. */
const RESEND_WAIT_SECONDS = 30;

function Divider() {
  return (
    <div className="relative flex w-full shrink-0 flex-col items-start py-[10px]" data-name="Divider">
      <div className="relative flex w-full shrink-0 items-center gap-[10px]">
        <div className="relative h-px min-w-px flex-[1_0_0] border border-solid border-stroke-2-light dark:border-stroke-2-dark" />
        <p className="type-mini-medium shrink-0 whitespace-nowrap text-center text-text-neutral-2-light dark:text-text-neutral-2-dark">Or</p>
        <div className="relative h-px min-w-px flex-[1_0_0] border border-solid border-stroke-2-light dark:border-stroke-2-dark" />
      </div>
    </div>
  );
}

function countdown(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function JoinCard({ start }: { start?: JoinCardStart }) {
  const [state, setState] = useState<State>(start ? ({ name: start.state } as State) : { name: "default" });
  const [email, setEmail] = useState(start?.email ?? "");
  const [password, setPassword] = useState(start?.password ?? "");
  const onSignIn = () => setState({ name: "signIn" });

  // The Resent state counts down, then offers the resend link again.
  useEffect(() => {
    if (state.name !== "resent") return;
    if (state.secondsLeft <= 0) {
      setState({ name: "sent" });
      return;
    }
    const timer = window.setTimeout(() => setState({ name: "resent", secondsLeft: state.secondsLeft - 1 }), 1000);
    return () => window.clearTimeout(timer);
  }, [state]);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (state.name === "sending") return;
    if (!looksLikeEmail(email)) {
      setState({ name: "error" });
      return;
    }
    setState({ name: "sending" });
    const result = await requestJoinLink(email.trim());
    if (result === "sent") setState({ name: "sent" });
    else if (result === "accountExists") onSignIn();
    else if (result === "invalidEmail") setState({ name: "error" });
    else setState({ name: "sendFailed" });
  }

  async function resend() {
    const result = await requestJoinLink(email.trim());
    if (result === "sent") setState({ name: "resent", secondsLeft: RESEND_WAIT_SECONDS });
    else if (result === "accountExists") onSignIn();
    else setState({ name: "sendFailed" });
  }

  async function signIn(event: FormEvent) {
    event.preventDefault();
    if (state.name === "signingIn") return;
    if (email.trim().length === 0 || password.length === 0) {
      setState({ name: "signInError" });
      return;
    }
    setState({ name: "signingIn" });
    // On success the page itself changes: the session arrives and the app shows the person's logos.
    const result = await signInWithEmail(email.trim(), password).catch(() => ({ error: true }));
    if (result.error) setState({ name: "signInError" });
  }

  if (state.name === "signIn" || state.name === "signingIn" || state.name === "signInError") {
    const busy = state.name === "signingIn";
    return (
      <div
        className="relative flex w-full shrink-0 flex-col items-center gap-[12px] rounded-[16px] border border-solid border-stroke-2-light bg-background-2-light p-[24px] desktop:w-[340px] dark:border-stroke-2-dark dark:bg-background-1-dark"
        data-name="gala-join-card"
      >
        <p className="type-body-semibold shrink-0 whitespace-nowrap text-text-neutral-1-light dark:text-text-neutral-1-dark">Sign in to Gala</p>
        {start?.passwordSet && (
          <p className="type-caption-medium w-full shrink-0 text-center text-text-neutral-1-light dark:text-text-neutral-1-dark" data-name="password-set" role="status">
            Your password is set. Sign in to start.
          </p>
        )}
        <form onSubmit={signIn} noValidate className="contents" data-name="sign-in form">
          <div className="relative flex w-full shrink-0 flex-col items-start gap-[8px]" data-name="fields">
            <LineField
              type="email"
              name="email"
              autoComplete="email"
              placeholder="Email"
              aria-label="Email"
              value={email}
              readOnly={busy}
              onChange={(event) => {
                setEmail(event.target.value);
                if (state.name === "signInError") setState({ name: "signIn" });
              }}
              className="w-full"
            />
            <LineField
              type="password"
              name="password"
              autoComplete="current-password"
              placeholder="Password"
              aria-label="Password"
              value={password}
              readOnly={busy}
              onChange={(event) => {
                setPassword(event.target.value);
                if (state.name === "signInError") setState({ name: "signIn" });
              }}
              className="w-full"
            />
          </div>
          {state.name === "signInError" && (
            <p className="type-mini-medium w-full shrink-0 text-error-text-light dark:text-error-text-dark" role="alert">
              That email and password don’t match.
            </p>
          )}
          <a
            href={`${config.frillyAppUrl}/app/auth/forgot-password`}
            target="_blank"
            rel="noreferrer"
            className="type-caption-semibold shrink-0 whitespace-nowrap text-text-blue-1-light dark:text-text-blue-1-dark"
            data-name="forgot"
          >
            Forgot password?
          </a>
          <PrimaryButton type="submit" className="w-full">
            {busy ? "Signing in…" : "Sign in"}
          </PrimaryButton>
        </form>
        <Divider />
        <GoogleButton onClick={continueWithGoogle} className="w-full" />
        <div className="type-caption-medium relative flex shrink-0 items-start gap-[4px] overflow-clip whitespace-nowrap" data-name="sign-in">
          <p className="shrink-0 text-text-neutral-1-light dark:text-text-neutral-1-dark">New to Gala?</p>
          <button type="button" onClick={() => setState({ name: "default" })} className="type-caption-semibold shrink-0 text-text-blue-1-light dark:text-text-blue-1-dark">
            Start your first logo
          </button>
        </div>
        <p className="type-mini-medium w-full shrink-0 text-center text-text-neutral-2-light dark:text-text-neutral-2-dark">
          Gala uses a free Frilly account, so your work and your kits stay yours.
        </p>
      </div>
    );
  }

  const showsSent = state.name === "sent" || state.name === "resent";
  const invalid = state.name === "error" || state.name === "sendFailed";

  return (
    <div
      className="relative flex w-full shrink-0 flex-col items-center gap-[12px] rounded-[16px] border border-solid border-stroke-2-light bg-background-2-light p-[24px] desktop:w-[340px] dark:border-stroke-2-dark dark:bg-background-1-dark"
      data-name="gala-join-card"
    >
      <p className="type-body-semibold shrink-0 whitespace-nowrap text-text-neutral-1-light dark:text-text-neutral-1-dark">Start your first logo</p>

      {showsSent ? (
        <div className="relative flex w-full shrink-0 flex-col items-center gap-[8px] py-[4px]" data-name="sent">
          <img alt="" src={checkCircleLight} width={32} height={32} className="size-[32px] shrink-0 dark:hidden" />
          <img alt="" src={checkCircleDark} width={32} height={32} className="hidden size-[32px] shrink-0 dark:block" />
          <p className="type-body-semibold w-full shrink-0 text-center text-text-neutral-1-light dark:text-text-neutral-1-dark" role="status">
            Check your email to get the access link.
          </p>
          <p className="type-caption-medium max-w-full shrink-0 truncate text-center text-text-neutral-2-light dark:text-text-neutral-2-dark">
            Sent to {email.trim()}
          </p>
          <div className="relative flex w-full shrink-0 flex-wrap items-start justify-center gap-x-[16px] gap-y-[4px]" data-name="links">
            <button
              type="button"
              onClick={() => setState({ name: "default" })}
              className="type-caption-semibold shrink-0 whitespace-nowrap text-text-blue-1-light dark:text-text-blue-1-dark"
            >
              Use a different email
            </button>
            {state.name === "resent" ? (
              <p className="type-caption-semibold shrink-0 whitespace-nowrap text-text-neutral-2-light dark:text-text-neutral-2-dark" role="status">
                Sent again. Another link in {countdown(state.secondsLeft)}.
              </p>
            ) : (
              <button
                type="button"
                onClick={resend}
                className="type-caption-semibold shrink-0 whitespace-nowrap text-text-blue-1-light dark:text-text-blue-1-dark"
              >
                Didn’t get it? Send again
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          <form onSubmit={send} noValidate className="relative flex w-full shrink-0 items-center gap-[8px]" data-name="email form">
            <LineField
              type="email"
              name="email"
              autoComplete="email"
              placeholder="Enter your email"
              aria-label="Enter your email"
              value={email}
              invalid={invalid}
              readOnly={state.name === "sending"}
              onChange={(event) => {
                setEmail(event.target.value);
                if (invalid) setState({ name: "default" });
              }}
              className="flex-[1_0_0]"
            />
            <button
              type="submit"
              aria-label="Send me the link"
              className={`relative flex size-[40px] shrink-0 items-center justify-center rounded-[100px] bg-button-1-default-light dark:bg-button-1-default-dark ${state.name === "sending" ? "opacity-[0.85]" : ""}`}
              data-name="Button-Primary-Icon"
            >
              {state.name === "sending" ? (
                <img alt="" src={spinner} width={20} height={20} className="size-[20px] shrink-0 motion-safe:animate-spin" />
              ) : (
                <img alt="" src={mail} width={24} height={24} className="size-[24px] shrink-0" />
              )}
            </button>
          </form>
          {state.name === "error" && (
            <p className="type-mini-medium w-full shrink-0 text-error-text-light dark:text-error-text-dark" role="alert">
              That doesn’t look like an email address.
            </p>
          )}
          {state.name === "sendFailed" && (
            <p className="type-mini-medium w-full shrink-0 text-error-text-light dark:text-error-text-dark" role="alert">
              The link didn’t send. Try again in a moment.
            </p>
          )}
        </>
      )}

      <Divider />
      <GoogleButton onClick={continueWithGoogle} className="w-full" />
      <div className="type-caption-medium relative flex shrink-0 items-start gap-[4px] overflow-clip whitespace-nowrap" data-name="sign-in">
        <p className="shrink-0 text-text-neutral-1-light dark:text-text-neutral-1-dark">Already on Frilly?</p>
        <button type="button" onClick={onSignIn} className="type-caption-semibold shrink-0 text-text-blue-1-light dark:text-text-blue-1-dark">
          Sign in
        </button>
      </div>
      <p className="type-mini-medium w-full shrink-0 text-center text-text-neutral-2-light dark:text-text-neutral-2-dark">
        Gala uses a free Frilly account, so your work and your kits stay yours.
      </p>
    </div>
  );
}
