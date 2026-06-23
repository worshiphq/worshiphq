import { useState, useEffect, useRef } from "react";
import { Mic, MicOff, Captions, BookOpen, Volume2, Settings2, ChevronUp } from "lucide-react";

export function AudioBar() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [detectedVerse, setDetectedVerse] = useState<string | null>(null);
  const waveformBars = 24;

  useEffect(() => {
    if (isListening) {
      const interval = setInterval(() => {
        const phrases = [
          "And the Word was made flesh...",
          "Let us open our Bibles to John chapter 3...",
          "For God so loved the world...",
          "The Lord is my shepherd, I shall not want...",
          "Praise the Lord! Praise God in His sanctuary...",
          "Let us pray together as a congregation...",
          "Turn with me to Romans chapter 8 verse 28...",
        ];
        setTranscript(phrases[Math.floor(Math.random() * phrases.length)]);
      }, 4000);

      const verseInterval = setInterval(() => {
        const verses = [
          "John 3:16", "Psalm 23:1", "Romans 8:28", null, null, "Philippians 4:13",
        ];
        setDetectedVerse(verses[Math.floor(Math.random() * verses.length)] ?? null);
      }, 6000);

      return () => { clearInterval(interval); clearInterval(verseInterval); };
    }
    return undefined;
  }, [isListening]);

  return (
    <div className={`shrink-0 border-t border-line bg-surface-2 transition-all ${expanded ? "h-28" : "h-10"}`}>
      <div className="flex h-10 items-center gap-2 px-3">
        {/* Mic toggle */}
        <button
          onClick={() => setIsListening(!isListening)}
          className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-medium transition-all ${
            isListening
              ? "bg-danger/15 text-danger"
              : "bg-surface-4 text-ink-faint hover:text-ink-muted"
          }`}
        >
          {isListening ? <Mic className="size-3" /> : <MicOff className="size-3" />}
          {isListening ? "Listening" : "Audio Off"}
        </button>

        {/* Waveform */}
        {isListening && (
          <div className="flex h-5 items-end gap-px">
            {Array.from({ length: waveformBars }).map((_, i) => (
              <div
                key={i}
                className="w-[2px] rounded-t bg-primary-bright/60"
                style={{
                  height: `${20 + Math.random() * 80}%`,
                  animation: `waveform ${0.3 + Math.random() * 0.4}s ease-in-out infinite`,
                  animationDelay: `${i * 0.05}s`,
                }}
              />
            ))}
          </div>
        )}

        {/* Live transcription */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Captions className="size-3 shrink-0 text-ink-faint" />
          <p className="truncate text-[11px] text-ink-muted">
            {isListening ? (transcript || "Listening for speech...") : "Enable audio to start live transcription"}
          </p>
        </div>

        {/* Detected verse */}
        {detectedVerse && isListening && (
          <div className="flex items-center gap-1.5 rounded-md bg-cyan/10 px-2 py-1">
            <BookOpen className="size-3 text-cyan" />
            <span className="text-[10px] font-medium text-cyan">{detectedVerse}</span>
            <button className="rounded bg-cyan/20 px-1.5 py-0.5 text-[9px] font-medium text-cyan hover:bg-cyan/30">
              Show
            </button>
          </div>
        )}

        {/* Volume indicator */}
        <div className="flex items-center gap-1">
          <Volume2 className="size-3 text-ink-faint" />
          <div className="h-1 w-12 overflow-hidden rounded-full bg-surface-4">
            <div className="h-full w-3/4 rounded-full bg-success/50" />
          </div>
        </div>

        {/* Expand */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="grid size-5 place-items-center rounded text-ink-faint hover:bg-surface-4 hover:text-ink-muted"
        >
          <ChevronUp className={`size-3 transition-transform ${expanded ? "" : "rotate-180"}`} />
        </button>

        <button className="grid size-5 place-items-center rounded text-ink-faint hover:bg-surface-4 hover:text-ink-muted">
          <Settings2 className="size-3" />
        </button>
      </div>

      {/* Expanded transcript area */}
      {expanded && (
        <div className="border-t border-line-soft px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-ink-faint">Transcript</span>
            <div className="flex-1 border-t border-line-soft" />
          </div>
          <div className="mt-1.5 max-h-10 overflow-y-auto">
            <p className="text-[11px] leading-relaxed text-ink-muted">
              {isListening ? transcript : "Audio input is disabled. Click the microphone button to start listening."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
