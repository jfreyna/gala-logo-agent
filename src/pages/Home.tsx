import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { HeroGlows } from "../backdrops/HeroGlows";
import { HallsHorizon } from "../backdrops/HallsHorizon";
import { JoinCard } from "../components/JoinCard";
import { ConceptCard, type Check } from "../components/ConceptCard";
import { HallCarousel } from "../components/HallCarousel";
import { HallModal } from "../components/HallModal";
import { HallTintFilters, type HallEntry, type HallKind } from "../components/HallTile";
import { useRouter } from "../lib/router";
import hearth from "../assets/marks/hearth.svg";
import monogram from "../assets/marks/monogram.svg";
import rising from "../assets/marks/rising.svg";

/** The three sample directions pictured beside the join card, as drawn in the frame. */
const SAMPLE_CHECKS: Check[] = [
  { label: "16px", pass: true },
  { label: "Circle", pass: true },
  { label: "Inverted", pass: true },
];
const SAMPLE_RATIONALE = "Holds its shape at 16px, and reads as a bakery before you read the name.";

/** A concept card at the size the hero draws it: 82% of the studio's card. */
function SampleCard({ letter, name, markUrl }: { letter: string; name: string; markUrl: string }) {
  return (
    <div className="h-[358.9px] w-[203.36px]" aria-hidden="true">
      <div className="origin-top-left scale-[0.82]">
        <ConceptCard letter={letter} name={name} rationale={SAMPLE_RATIONALE} markUrl={markUrl} checks={SAMPLE_CHECKS} />
      </div>
    </div>
  );
}

/**
 * The halls section's desktop height: the horizon alone, or the horizon with
 * one or two halls under it. A hall with no entries is not shown at all.
 */
const HALLS_HEIGHT = ["desktop:h-[523px]", "desktop:h-[862px]", "desktop:h-[1259px]"] as const;

function useHall(kind: HallKind): HallEntry[] {
  const rows = useQuery(api.halls.list, { hall: kind });
  return (rows ?? []).map((row) => ({ id: row._id, brandName: row.brandName, markUrl: row.markUrl, quote: row.quote }));
}

/**
 * The front page (Figma "Intro" frames 5595:14205, :14245, :14285, :14320):
 * the hero with the join card, the video, then the two halls, then the footer.
 */
export function Home({ sample, sampleOpen }: { sample?: { fame: HallEntry[]; shame: HallEntry[] }; sampleOpen?: HallKind }) {
  const { location } = useRouter();
  const liveFame = useHall("fame");
  const liveShame = useHall("shame");
  const fame = sample?.fame ?? liveFame;
  const shame = sample?.shame ?? liveShame;
  const sampleEntry = sampleOpen ? sample?.[sampleOpen].find((entry) => entry.quote !== null) : undefined;
  const [open, setOpen] = useState<{ entry: HallEntry; kind: HallKind } | null>(sampleOpen && sampleEntry ? { entry: sampleEntry, kind: sampleOpen } : null);

  const shownHalls = (fame.length > 0 ? 1 : 0) + (shame.length > 0 ? 1 : 0);

  return (
    <div className="relative flex min-h-full w-full flex-col items-start overflow-clip bg-background-2-light dark:bg-background-1-dark" data-name="Intro">
      <HallTintFilters />
      <HeroGlows className="left-[-386px] top-0 h-[680px] w-[1152px] desktop:left-1/2 desktop:h-[850px] desktop:w-full desktop:min-w-[1440px] desktop:-translate-x-1/2" />
      <Header state="signedOut" />

      <section className="hero relative flex w-full shrink-0 flex-col items-center justify-start gap-[24px] overflow-clip border-b-2 border-solid border-brand-tertiary-200 px-[16px] pb-[40px] pt-[32px] desktop:h-[786px] desktop:justify-center desktop:gap-[8px] desktop:px-[190px] desktop:py-[40px] dark:border-brand-tertiary-700">
        <div className="relative flex w-full shrink-0 flex-col items-center gap-[12px] overflow-clip text-center desktop:gap-[16px] desktop:px-[80px]" data-name="header">
          <h1 className="w-full shrink-0 whitespace-pre-wrap font-headings text-[40px] font-bold leading-[41px] text-primary-light desktop:text-[60px] desktop:leading-[60px] dark:text-primary-dark">
            {"Meet Gala, \nyour logo design partner."}
          </h1>
          <p className="type-body-regular w-full shrink-0 text-[20px] text-headline-2-light desktop:font-headings desktop:text-[32px] desktop:leading-[37px] desktop:[font-variation-settings:normal] dark:text-headline-2-dark">
            Gala researches, drafts, and designs your logo. Then hands you a finished kit. All with your direction.
          </p>
        </div>
        <div className="relative flex w-full shrink-0 flex-col items-center gap-[24px] overflow-clip desktop:w-auto desktop:flex-row desktop:items-center desktop:gap-[20px]" data-name="content">
          <div className="relative hidden h-[400px] w-[350px] shrink-0 desktop:block" data-name="visual">
            <div className="absolute left-[16px] top-[5px]">
              <SampleCard letter="B" name="Monogram" markUrl={monogram} />
            </div>
            <div className="absolute left-[113px] top-[20px] flex h-[378.191px] w-[239.761px] items-center justify-center">
              <div className="flex-none -rotate-6">
                <SampleCard letter="C" name="Rising" markUrl={rising} />
              </div>
            </div>
          </div>
          {/* Someone arriving from setting their Frilly password lands on ?signin=1: the card opens on Sign in. */}
          <JoinCard start={new URLSearchParams(location.search).get("signin") === "1" ? { state: "signIn", passwordSet: true } : undefined} />
          <div className="relative hidden h-[400px] w-[350px] shrink-0 desktop:block" data-name="visual">
            <div className="absolute left-[22.46px] top-[10px] flex h-[378.191px] w-[239.761px] items-center justify-center">
              <div className="flex-none rotate-6">
                <SampleCard letter="A" name="Hearth" markUrl={hearth} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/*
        The video: muted so it can start on its own. YouTube shows its controls on hover or tap.
        The frame stretches with the page up to 1080 wide and keeps 16:9; the border sits outside it.
      */}
      <section className="relative flex w-full shrink-0 flex-col items-center gap-[20px] px-[16px] pb-[24px] pt-[40px] desktop:gap-[32px] desktop:px-[40px] desktop:pb-[56px] desktop:pt-[80px]" data-name="video">
        <h2 className="w-full text-center font-headings text-[28px] font-bold leading-[normal] text-headline-1-light desktop:text-[36px] dark:text-headline-1-dark">See Gala at work</h2>
        <div className="relative aspect-video w-full max-w-[1080px] overflow-hidden rounded-[12px] shadow-[0px_8px_24px_0px_rgba(3,28,41,0.12)] ring-2 ring-brand-tertiary-200 desktop:rounded-[16px] desktop:shadow-[0px_16px_48px_0px_rgba(3,28,41,0.12)] dark:shadow-[0px_8px_24px_0px_rgba(3,28,41,0.4)] dark:ring-brand-tertiary-700 dark:desktop:shadow-[0px_16px_48px_0px_rgba(3,28,41,0.4)]">
          <iframe
            className="absolute inset-0 h-full w-full"
            src="https://www.youtube-nocookie.com/embed/XZ4PGqv5Zyg?autoplay=1&mute=1&controls=1&playsinline=1&loop=1&playlist=XZ4PGqv5Zyg&rel=0"
            title="Gala demo video"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      </section>

      <section
        className={`relative flex w-full shrink-0 flex-col items-start gap-[32px] overflow-clip pb-[48px] desktop:block desktop:pb-0 ${HALLS_HEIGHT[shownHalls]}`}
        data-name="halls"
      >
        <div className="relative h-[200px] w-full shrink-0 overflow-clip desktop:absolute desktop:left-0 desktop:top-0 desktop:h-[523px] desktop:overflow-visible">
          <HallsHorizon className="left-1/2 top-[20.92px] aspect-[1440/523] w-[max(518.4px,136.42%)] -translate-x-1/2 desktop:top-0 desktop:aspect-auto desktop:h-[523px] desktop:w-full desktop:min-w-[1440px]" />
        </div>
        <div className="relative flex w-full flex-col items-start gap-[32px] desktop:absolute desktop:left-0 desktop:top-[430px] desktop:gap-[48px]">
          {fame.length > 0 && <HallCarousel kind="fame" entries={fame} onOpen={(entry) => setOpen({ entry, kind: "fame" })} />}
          {shame.length > 0 && <HallCarousel kind="shame" entries={shame} onOpen={(entry) => setOpen({ entry, kind: "shame" })} />}
        </div>
      </section>

      <Footer />
      {open && <HallModal entry={open.entry} kind={open.kind} onClose={() => setOpen(null)} />}
    </div>
  );
}
