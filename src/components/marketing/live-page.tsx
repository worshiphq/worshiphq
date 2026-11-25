import Image from "next/image";
import Link from "next/link";
import { BookOpen, Cast, CheckCircle2, Cloud, Download, ListMusic, Mic, MonitorPlay, NotebookPen, Presentation, Sparkles, WifiOff } from "lucide-react";
import { PageHero } from "@/components/marketing/page-hero";
import { Reveal } from "@/components/ui/reveal";
import { media } from "@/config/pricing";
import { windowEnd, windowLive, type Promotions } from "@/lib/promotions";

const money = (n: number) => `GHS ${n.toLocaleString("en-GH")}`;

const FEATURES = [
  { icon: ListMusic, title: "Songs", text: "Your songs with their own order, font, colours and background. Bring them over from EasyWorship or text files. A library of public-domain hymns is included." },
  { icon: BookOpen, title: "Bible", text: "Type a reference or a few words and show it. Put a second version underneath, and search across every version on the computer." },
  { icon: Mic, title: "Voice assistant", text: "Listens to the preacher and finds verses as they are mentioned. You choose: ask first, show by itself, or only list them. It can mishear, so asking first is the default." },
  { icon: NotebookPen, title: "Sermon notes", text: "Writes down the points and verses of the message while you work on other things. Tidy them up, then show any of them on the screen." },
  { icon: MonitorPlay, title: "Preview, then live", text: "Everything goes to Preview first. Press Enter, or double-click, to send it to the projector." },
  { icon: Presentation, title: "Pictures, videos and slides", text: "Pictures, videos, PowerPoint and PDF, slides you design, a ticker, countdowns and announcements that loop before the service." },
  { icon: Cast, title: "Screens", text: "The main projector, a stage screen for the team, and words on green for a livestream in OBS." },
  { icon: WifiOff, title: "Works without internet", text: "Songs, Bibles, pictures and offline listening all run on your computer. Sign in online once, then connect at least every 30 days." },
  { icon: Cloud, title: "Backup", text: "Save everything to a file, or keep a copy with WorshipHQ and bring it back on another computer." },
];

/** The WorshipHQ Live page. Hidden until SuperAdmin ticks "Launched" (SuperAdmin can look at it before). */
export function LivePage({ promotions, downloadReady }: { promotions: Promotions; downloadReady: boolean }) {
  const free = windowLive(promotions.mediaFree) && promotions.mediaFree.everyone;
  const end = windowEnd(promotions.mediaFree);
  const until = free && end ? end.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" }) : null;
  const button = downloadReady ? (
    <a href="/api/media/download" className="inline-flex items-center gap-2 rounded-full bg-parchment px-7 py-3.5 text-sm font-semibold text-evergreen-deep hover:bg-white">
      <Download className="size-4" aria-hidden /> Download for Windows
    </a>
  ) : (
    <span className="inline-flex rounded-full border border-parchment/40 px-7 py-3.5 text-sm font-semibold text-parchment">The download opens very soon</span>
  );
  return (
    <>
      <PageHero
        eyebrow="WorshipHQ Live"
        title={<>Your church screen,<br /><span className="text-primary">simply done.</span></>}
        subtitle="Songs, Bible verses, pictures, videos and sermon notes on the projector, with a voice assistant that finds verses as they are preached."
      >
        {button}
        <p className="mt-4 text-sm text-parchment/70">
          {until ? `Free for every church until ${until}.` : `Free for ${media.trialDays} days.`} Windows 10 or 11.
        </p>
      </PageHero>

      <section className="py-14 sm:py-20">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal>
            <Image src="/marketing/live/live-songs.webp" alt="WorshipHQ Live: the hymn Amazing Grace in Preview and on the live screen" width={1800} height={1125} className="w-full border border-ink/15 shadow-[0_30px_80px_-40px_rgba(28,26,22,0.6)]" priority />
          </Reveal>
        </div>
      </section>

      <section className="pb-14 sm:pb-20">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="text-center font-display text-3xl font-bold sm:text-4xl">Everything a service needs</h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="border border-ink/10 bg-white/50 p-6">
                <f.icon className="size-6 text-primary" aria-hidden />
                <h3 className="mt-4 font-display text-xl font-bold">{f.title}</h3>
                <p className="mt-2 text-[15px] leading-[1.7] text-ink-muted">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-ink/10 bg-white/40 py-14 sm:py-20">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <NotebookPen className="size-7 text-primary" aria-hidden />
            <h2 className="mt-4 font-display text-3xl font-bold">The message, written down as it is preached</h2>
            <p className="mt-4 leading-[1.8] text-ink-muted">Press &ldquo;Take notes today&rdquo;. Points the preacher announces are written down, the verses you show are added, and everything is kept with the service and its date. Change the words, then put any point on the screen.</p>
            <p className="mt-3 flex items-start gap-2 text-sm text-ink-muted"><Sparkles className="mt-0.5 size-4 shrink-0 text-brass" aria-hidden /> With internet, WorshipHQ AI also picks out points that weren&rsquo;t announced. Check them before you show them.</p>
          </div>
          <Image src="/marketing/live/live-notes.webp" alt="Sermon notes in WorshipHQ Live, with a point on the live screen" width={1800} height={1125} className="w-full border border-ink/15 shadow-xl" />
        </div>
      </section>

      <LivePrices promotions={promotions} />

      <section className="bg-evergreen-deep py-16 text-center text-parchment">
        <h2 className="font-display text-3xl font-bold">Ready for your next service</h2>
        <p className="mx-auto mb-8 mt-3 max-w-xl px-5 text-parchment/75">Install it, then sign in with your WorshipHQ account or make one inside the app. You don&rsquo;t need to use anything else from WorshipHQ.</p>
        {button}
      </section>
    </>
  );
}

/** What WorshipHQ Live costs, from SuperAdmin. Also shown on the pricing page once it is launched. */
export function LivePrices({ promotions, link }: { promotions: Promotions; link?: boolean }) {
  const p = promotions.livePrices;
  const off = windowLive(promotions.mediaDiscount) ? promotions.mediaDiscount : null;
  const rows = (["free", "starter", "pro", "max"] as const).map((id) => {
    const cut = off && id !== "free" ? off[id] : 0;
    const take = (n: number) => Math.round(n * (1 - cut / 100) * 100) / 100;
    return { id, cut, name: id === "free" ? "On its own, or on Free" : `With ${id[0].toUpperCase()}${id.slice(1)}`, monthly: take(p[id].monthly), yearly: take(p[id].yearly) };
  });
  return (
    <section id="live" className="py-14 sm:py-20">
      <div className="mx-auto max-w-4xl px-5">
        <h2 className="text-center font-display text-3xl font-bold sm:text-4xl">WorshipHQ Live prices</h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-ink-muted">
          The presentation app for your church screen, on {media.computers} computers. The bigger your church&rsquo;s WorshipHQ plan, the less it costs.
          {link && <> <Link href="/live" className="font-medium text-evergreen underline underline-offset-4">See what it does</Link></>}
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {rows.map((r) => (
            <div key={r.id} className="border border-ink/10 bg-white/60 p-5 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">{r.name}</p>
              <p className="mt-3 font-display text-3xl font-bold">{money(r.monthly)}</p>
              <p className="text-sm text-ink-muted">a month</p>
              <p className="mt-2 text-sm text-ink">or {money(r.yearly)} a year</p>
              {r.cut > 0 && <p className="mt-1 text-xs font-semibold text-primary">{r.cut}% off now</p>}
            </div>
          ))}
        </div>
        <p className="mt-5 flex items-center justify-center gap-2 text-sm text-ink-muted"><CheckCircle2 className="size-4 text-primary" aria-hidden /> Paid by Mobile Money or card, on top of your WorshipHQ plan.</p>
      </div>
    </section>
  );
}
