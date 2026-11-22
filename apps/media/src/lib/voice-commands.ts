import { wordsToNumbers } from "./spoken-ref";

/** Things the operator (or preacher) can say to control the screen. */
export type VoiceCommand =
  | { type: "verse"; delta: 1 | -1 }
  | { type: "gotoVerse"; start: number; end?: number }
  | { type: "chapter"; chapter: number; start?: number; end?: number }
  | { type: "chapterDelta"; delta: 1 | -1 }
  | { type: "slide"; delta: 1 | -1 }
  | { type: "clear" }
  | { type: "black" }
  | { type: "show" }
  | { type: "cancel" };

export type CommandGroup = "bible" | "slides" | "screen" | "banner";

export const COMMAND_GROUP: Record<VoiceCommand["type"], CommandGroup> = {
  verse: "bible", gotoVerse: "bible", chapter: "bible", chapterDelta: "bible",
  slide: "slides", clear: "screen", black: "screen", show: "banner", cancel: "banner",
};

/** What to say, for the help list in Settings and on the Voice assistant page. */
export const COMMAND_HELP: { group: CommandGroup; title: string; examples: string[] }[] = [
  { group: "bible", title: "Move through the Bible", examples: ["Next verse", "Previous verse", "Verse 5", "Verses 5 to 8", "Chapter 4", "Chapter 4 verse 2", "Next chapter"] },
  { group: "slides", title: "Songs and slides", examples: ["Next slide", "Previous slide", "Next part"] },
  { group: "screen", title: "The screen", examples: ["Clear the screen", "Black screen"] },
  { group: "banner", title: "The verse banner", examples: ["Show it", "Cancel"] },
];

/** Words people put around a command ("okay, let's go to the next verse please"). */
const FILLER = /^(?:(?:okay|ok|alright|all right|so|and|now|then|um|uh|yes|yeah|please|church|let's|lets|let us|we|will|go|go to|move to|turn to|move on to|give me|show me|can we|could we|take us to|on to|onto|to|the)\s+)+/;
const TRAIL = /(?:\s+(?:please|now|then|thank you|thanks))+$/;

/**
 * Reads one spoken sentence as a command. Only short sentences count, so the preacher saying
 * "and in the next verse Paul says…" in the sermon doesn't move the screen.
 * With `wake`, the sentence must start with the wake word (e.g. "Media, next verse").
 */
export function parseVoiceCommand(text: string, wake?: string): VoiceCommand | null {
  let s = wordsToNumbers(text.replace(/'/g, "")).replace(/\s+/g, " ").trim();
  if (wake) {
    const w = wordsToNumbers(wake).trim();
    if (!w) return null;
    if (!s.startsWith(w + " ") && s !== w) return null;
    s = s.slice(w.length).trim();
  }
  s = s.replace(FILLER, "").replace(TRAIL, "").trim();
  if (!s || s.split(" ").length > 6) return null;

  if (/^(?:next|following) (?:verse|scripture|one)$|^next$|^verse forward$/.test(s)) return { type: "verse", delta: 1 };
  if (/^(?:previous|last|prior|former) (?:verse|scripture|one)$|^(?:go )?back(?: a verse| one)?$|^verse back$|^one verse back$/.test(s)) return { type: "verse", delta: -1 };

  let m = s.match(/^(?:verses?|v) (\d{1,3})(?: (?:to|through|thru|and|till|until) (\d{1,3}))?$/);
  if (m) return { type: "gotoVerse", start: +m[1], end: m[2] && +m[2] > +m[1] ? +m[2] : undefined };

  m = s.match(/^chapter (\d{1,3})(?: (?:and )?(?:verses?|v) (\d{1,3})(?: (?:to|through|thru|and) (\d{1,3}))?)?$/);
  if (m) return { type: "chapter", chapter: +m[1], start: m[2] ? +m[2] : undefined, end: m[3] && m[2] && +m[3] > +m[2] ? +m[3] : undefined };

  if (/^next chapter$/.test(s)) return { type: "chapterDelta", delta: 1 };
  if (/^(?:previous|last) chapter$/.test(s)) return { type: "chapterDelta", delta: -1 };

  if (/^(?:next|following) (?:slide|part|page|line|stanza)$/.test(s)) return { type: "slide", delta: 1 };
  if (/^(?:previous|last) (?:slide|part|page|line|stanza)$|^slide back$/.test(s)) return { type: "slide", delta: -1 };

  if (/^clear(?: (?:it|that|everything|the words|the screen|screen|words|text))?$/.test(s)) return { type: "clear" };
  if (/^(?:black|blank)(?: (?:the )?screen| it| out)?$|^blackout$|^go black$/.test(s)) return { type: "black" };

  if (/^(?:show|display|project|put up)(?: (?:it|that|this|that verse|the verse|it up))?$|^put it (?:up|on)(?: the screen)?$/.test(s)) return { type: "show" };
  if (/^(?:cancel|dismiss|not that(?: one)?|wrong(?: one)?|ignore(?: it| that)?)$/.test(s)) return { type: "cancel" };
  return null;
}

export function describeCommand(c: VoiceCommand): string {
  switch (c.type) {
    case "verse": return c.delta > 0 ? "Next verse" : "Previous verse";
    case "gotoVerse": return c.end ? `Verses ${c.start}–${c.end}` : `Verse ${c.start}`;
    case "chapter": return `Chapter ${c.chapter}${c.start ? `:${c.start}${c.end ? `–${c.end}` : ""}` : ""}`;
    case "chapterDelta": return c.delta > 0 ? "Next chapter" : "Previous chapter";
    case "slide": return c.delta > 0 ? "Next slide" : "Previous slide";
    case "clear": return "Clear the words";
    case "black": return "Black screen";
    case "show": return "Show it";
    case "cancel": return "Cancel";
  }
}
