import { useState, useEffect } from "react";
import { Mic, MicOff, BookOpen, Volume2, ChevronUp } from "lucide-react";

export function AudioBar() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [detectedVerse, setDetectedVerse] = useState<string | null>(null);

  useEffect(() => {
    if (!isListening) return;
    const interval = setInterval(() => {
      const phrases = [
        "And the Word was made flesh and dwelt among us...",
        "Let us open our Bibles to John chapter 3...",
        "For God so loved the world that He gave His only begotten Son...",
        "The Lord is my shepherd, I shall not want...",
        "Praise the Lord! Praise God in His sanctuary...",
        "Let us pray together as a congregation...",
        "Turn with me to Romans chapter 8 verse 28...",
      ];
      setTranscript(phrases[Math.floor(Math.random() * phrases.length)]);
    }, 4000);
    const verseInterval = setInterval(() => {
      const verses = ["John 3:16", "Psalm 23:1", "Romans 8:28", null, null, "Philippians 4:13"];
      setDetectedVerse(verses[Math.floor(Math.random() * verses.length)] ?? null);
    }, 6000);
    return () => {
      clearInterval(interval);
      clearInterval(verseInterval);
    };
  }, [isListening]);

  return (
    <div
      className={`shrink-0 border-t border-line bg-surface-2 transition-all duration-300 ${expanded ? "h-28" : "h-9"}`}
    >
      <div className="flex h-9 items-center gap-3 px-3">
        <span className="text-[9px] font-semibold text-ink-muted">Audio Transcription</span>

        <div className="h-3 w-px bg-line" />

        <button
          onClick={() => setIsListening(!isListening)}
          className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors ${
            isListening
              ? "bg-danger/15 text-danger"
              : "bg-surface-4 text-ink-faint hover:bg-surface-5 hover:text-ink-muted"
          }`}
        >
          {isListening ? <Mic className="size-3" /> : <MicOff className="size-3" />}
          {isListening ? "Listening" : "Off"}
        </button>

        <div className="flex h-4 items-center gap-[2px]">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className={`w-[2px] rounded-full transition-all ${
                isListening ? "bg-ink-muted/40" : "bg-surface-5"
              }`}
              style={{
                height: isListening ? `${20 + Math.random() * 80}%` : "15%",
                animation: isListening
                  ? `waveform ${0.3 + Math.random() * 0.5}s ease-in-out infinite`
                  : "none",
                animationDelay: `${i * 0.04}s`,
                transformOrigin: "bottom",
              }}
            />
          ))}
        </div>

        <p className="min-w-0 flex-1 truncate text-[10px] italic text-ink-faint">
          {isListening
            ? transcript || "Listening for speech..."
            : "Enable audio to start transcription"}
        </p>

        {detectedVerse && isListening && (
          <div className="fade-in flex items-center gap-1.5 rounded-md bg-cyan/8 px-2 py-0.5">
            <BookOpen className="size-3 text-cyan" />
            <span className="text-[9px] font-semibold text-cyan">{detectedVerse} detected</span>
            <button className="rounded bg-cyan/15 px-1.5 py-0.5 text-[8px] font-bold text-cyan hover:bg-cyan/25">
              Show
            </button>
          </div>
        )}

        <div className="flex items-center gap-1">
          <Volume2 className="size-3 text-ink-faint" />
          <div className="h-1 w-10 overflow-hidden rounded-full bg-surface-4">
            <div
              className={`h-full rounded-full transition-all ${
                isListening ? "w-3/4 bg-success/60" : "w-1/4 bg-surface-5"
              }`}
            />
          </div>
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          className="grid size-5 place-items-center rounded text-ink-faint hover:bg-surface-4"
        >
          <ChevronUp
            className={`size-3 transition-transform ${expanded ? "" : "rotate-180"}`}
          />
        </button>
      </div>

      {expanded && (
        <div className="fade-in border-t border-line px-3 py-1.5">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-[8px] font-bold uppercase tracking-widest text-ink-faint">
              Live Transcript
            </span>
            <div className="flex-1 border-t border-line-soft" />
            {isListening && <div className="live-dot size-1.5 rounded-full bg-danger" />}
          </div>
          <p className="text-[10px] leading-relaxed text-ink-muted">
            {isListening
              ? transcript
              : "Audio input is disabled. Click the microphone button to start listening."}
          </p>
        </div>
      )}
    </div>
  );
}
