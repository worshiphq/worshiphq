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
  | { type: "cancel" }
  /** Change the Bible version (or the second one shown underneath). `query` is matched against the Bibles on this computer. */
  | { type: "version"; query: string; second?: boolean }
  | { type: "secondOff" };

export type CommandGroup = "bible" | "slides" | "screen" | "banner";

export const COMMAND_GROUP: Record<VoiceCommand["type"], CommandGroup> = {
  verse: "bible", gotoVerse: "bible", chapter: "bible", chapterDelta: "bible",
  slide: "slides", clear: "screen", black: "screen", show: "banner", cancel: "banner",
  version: "bible", secondOff: "bible",
};

/** What to say, for the help list in Settings and on the Voice assistant page. */
export const COMMAND_HELP: { group: CommandGroup; title: string; examples: string[] }[] = [
  { group: "bible", title: "Move through the Bible", examples: ["Next verse", "Previous verse", "Verse 5", "Verses 5 to 8", "Chapter 4", "Chapter 4 verse 2", "Next chapter"] },
  { group: "bible", title: "Change the Bible version", examples: ["Give me the Amplified version", "Read it in NIV", "Switch to Twi", "Add King James underneath", "Remove the second version"] },
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

  // Bible versions (checked against the Bibles on this computer before acting).
  const version = (q: string) => q.replace(/\s+(?:version|bible|translation)$/, "").replace(/^the /, "").trim();
  if (/^(?:remove|drop|hide|no|take off|turn off|clear|close) (?:the )?(?:second|other|bottom|extra) (?:version|bible|translation)$/.test(s)) return { type: "secondOff" };
  m = s.match(/^(?:add|also show|show also|put|include|bring) (?:the )?(.+?) (?:underneath|below|beneath|under it|under|too|as well|also|as (?:the )?second(?: version)?|at the bottom)$/);
  if (m) return { type: "version", query: version(m[1]), second: true };
  m = s.match(/^second (?:version|bible|translation)(?: to| in| is)? (.+)$/);
  if (m) return { type: "version", query: version(m[1]), second: true };
  m = s.match(/^(?:switch|change|swap|turn)(?: it| that| this)?(?: over)? (?:to|into) (?:the )?(.+)$/);
  if (m) return { type: "version", query: version(m[1]) };
  m = s.match(/^(?:read|show|put|display|give)(?: it| that| this| us| me)? in (?:the )?(.+)$/);
  if (m) return { type: "version", query: version(m[1]) };
  m = s.match(/^in (?:the )?(.+)$/);
  if (m && m[1].split(" ").length <= 4) return { type: "version", query: version(m[1]) };
  m = s.match(/^(.+?) (?:version|translation|bible)$/);
  if (m && m[1].split(" ").length <= 4) return { type: "version", query: version(m[1]) };

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
    case "version": return c.second ? `Second version: ${c.query}` : `Version: ${c.query}`;
    case "secondOff": return "Remove the second version";
  }
}
