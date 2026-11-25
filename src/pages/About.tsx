import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { AboutRibbons } from "../backdrops/AboutRibbons";
import { PrimaryButton } from "../components/Buttons";
import { useRouter } from "../lib/router";

const PHASES: { phase: string; summary: string }[] = [
  {
    phase: "Discovery",
    summary: "Your brand, your audience, three words you never want, and a look at your competitors and neighbors.",
  },
  {
    phase: "Form and type, in black and white",
    summary: "Google fonts chosen by Google’s own categories, and marks drawn without color, so the shape carries the identity.",
  },
  {
    phase: "Concepts and the stress test",
    summary: "Three directions, three refinements of your pick, and every mark tested at 16px, in a circle and inverted.",
  },
  { phase: "Color", summary: "Your primary, secondary and tertiary, applied three ways." },
  { phase: "The kit", summary: "Lock-ups, the full color ladders, and files in SVG, EPS and PNG." },
];

function SectionTitle({ children }: { children: string }) {
  return (
    <h2 className="shrink-0 font-headings text-[22px] font-bold leading-[normal] text-headline-1-light dark:text-headline-1-dark">{children}</h2>
  );
}

function Para({ children }: { children: string }) {
  return <p className="type-body-regular w-full shrink-0 text-text-neutral-1-light dark:text-text-neutral-1-dark">{children}</p>;
}

/**
 * About Gala (Figma "About" frames 5595:14355, :14422, :14489, :14556): one
 * translucent column over the ribbons backdrop.
 */
export function About() {
  const { navigate } = useRouter();
  return (
    <div className="relative flex min-h-full w-full flex-col items-start overflow-clip bg-background-2-light dark:bg-background-1-dark" data-name="About">
      <AboutRibbons className="left-[-674px] top-[-20.8px] h-[1615.2px] w-[1728px] desktop:left-1/2 desktop:top-0 desktop:h-[1346px] desktop:w-full desktop:min-w-[1440px] desktop:-translate-x-1/2" />
      <Header state="signedOut" />
      <main className="relative flex w-full shrink-0 flex-col items-center px-[16px] pb-[48px] pt-[32px] desktop:px-[24px] desktop:pb-[96px] desktop:pt-[72px]" data-name="body">
        <div
          className="relative flex w-full shrink-0 flex-col items-start gap-[32px] bg-[rgba(255,255,255,0.85)] px-[20px] py-[24px] desktop:w-[768px] desktop:gap-[48px] desktop:p-[40px] dark:bg-[rgba(0,0,0,0.85)]"
          data-name="column"
        >
          <div className="relative flex w-full shrink-0 flex-col items-start gap-[16px]" data-name="intro">
            <h1 className="type-h1-l w-full shrink-0 text-headline-1-light dark:text-headline-1-dark">About Gala</h1>
            <p className="type-body-regular w-full shrink-0 text-[20px] text-headline-2-light dark:text-headline-2-dark">
              Gala is a creative director type of agent that helps a business owner or a designer generate logo ideas for their clients.
            </p>
          </div>

          <section className="relative flex w-full shrink-0 flex-col items-start gap-[12px]" data-name="section/Why the name">
            <SectionTitle>Why the name</SectionTitle>
            <Para>
              Named after Gala Dalí. Gala was the muse, business manager, and creative partner to Salvador Dalí. Beyond inspiring his surrealist visuals, she actively managed his contracts, marketing, and public persona, effectively turning his name into a commercial brand.
            </Para>
            <Para>Gala represents the bridge between pure visual art and practical business execution.</Para>
            <p className="type-mini-medium w-full shrink-0 text-text-neutral-1-light dark:text-text-neutral-1-dark">
              Gala is an independent project by Frilly and an homage, not affiliated with or endorsed by the Gala-Salvador Dalí Foundation.
            </p>
          </section>

          <section className="relative flex w-full shrink-0 flex-col items-start gap-[12px]" data-name="section/How Gala works">
            <SectionTitle>How Gala works</SectionTitle>
            {PHASES.map((item, index) => (
              <div key={item.phase} className="relative flex w-full shrink-0 items-start gap-[16px]" data-name={`phase/${index + 1}`}>
                <div className="relative flex size-[32px] shrink-0 items-center justify-center rounded-[999px] bg-background-3-light dark:bg-background-3-dark" data-name="number">
                  <span className="type-caption-semibold shrink-0 text-text-neutral-1-light dark:text-text-neutral-1-dark">{index + 1}</span>
                </div>
                <div className="relative flex min-w-px flex-[1_0_0] flex-col items-start gap-[2px]" data-name="texts">
                  <p className="type-body-semibold w-full shrink-0 text-headline-1-light dark:text-headline-1-dark">{item.phase}</p>
                  <p className="type-caption-medium w-full shrink-0 text-text-neutral-1-light dark:text-text-neutral-1-dark">{item.summary}</p>
                </div>
              </div>
            ))}
            <p className="type-caption-medium w-full shrink-0 text-text-neutral-1-light dark:text-text-neutral-1-dark">
              Every choice comes in threes, so you compare instead of wondering.
            </p>
          </section>

          <section className="relative flex w-full shrink-0 flex-col items-start gap-[12px]" data-name="section/Halls of fame and shame">
            <SectionTitle>Halls of fame and shame</SectionTitle>
            <Para>
              At the end you can submit the logo you loved and the draft you hated, each with a line on why. They appear on Gala’s front page only if you submit them.
            </Para>
          </section>

          <section className="relative flex w-full shrink-0 flex-col items-start gap-[12px]" data-name="section/Built on">
            <SectionTitle>Built on</SectionTitle>
            <Para>
              Gala runs on a Fly.io Sprite. Gemini writes and draws, TypeSafe’s Jev checks the work, Google Fonts sets the type, and Convex keeps your projects, files and Gala’s memory. Made by Frilly.
            </Para>
          </section>

          <PrimaryButton onClick={() => navigate("/")} className="w-full desktop:w-[280px]">
            Start your first logo
          </PrimaryButton>
        </div>
      </main>
      <Footer />
    </div>
  );
}
