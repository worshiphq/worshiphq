import { useState, useEffect } from "react";
import { Mic, MicOff, Captions, BookOpen, Volume2, ChevronUp, Zap } from "lucide-react";

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
    return () => { clearInterval(interval); clearInterval(verseInterval); };
  }, [isListening]);

  return (
    <div className={`shrink-0 border-t border-line bg-surface-2 transition-all duration-300 ${expanded ? "h-32" : "h-11"}`}>
      <div className="flex h-11 items-center gap-3 px-4">
        {/* AI badge */}
        <div className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5">
          <Zap className="size-3 text-primary-bright" />
          <span className="text-[9px] font-bold text-primary-bright">AI</span>
        </div>

        {/* Mic toggle */}
        <button
          onClick={() => setIsListening(!isListening)}
          className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-medium transition-all ${
            isListening
              ? "bg-danger/15 text-danger shadow-sm shadow-danger/10"
              : "bg-surface-4 text-ink-faint hover:bg-surface-5 hover:text-ink-muted"
          }`}
        >
          {isListening ? <Mic className="size-3.5" /> : <MicOff className="size-3.5" />}
          {isListening ? "Listening" : "Audio Off"}
        </button>

        {/* Waveform visualization */}
        <div className="flex h-6 items-center gap-[2px]">
          {Array.from({ length: 32 }).map((_, i) => (
            <div
              key={i}
              className={`w-[2px] rounded-full transition-all ${
                isListening ? "bg-primary-bright/50" : "bg-surface-5"
              }`}
              style={{
                height: isListening ? `${20 + Math.random() * 80}%` : "15%",
                animation: isListening ? `waveform ${0.3 + Math.random() * 0.5}s ease-in-out infinite` : "none",
                animationDelay: `${i * 0.04}s`,
                transformOrigin: "bottom",
              }}
            />
          ))}
        </div>

        {/* Transcription text */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Captions className="size-3.5 shrink-0 text-ink-faint" />
          <p className="truncate text-[11px] text-ink-muted">
            {isListening ? (transcript || "Listening for speech...") : "Enable audio to start live transcription"}
          </p>
        </div>

        {/* Detected verse chip */}
        {detectedVerse && isListening && (
          <div className="fade-in flex items-center gap-1.5 rounded-xl bg-cyan/10 px-2.5 py-1.5 shadow-sm shadow-cyan/5">
            <BookOpen className="size-3 text-cyan" />
            <span className="text-[10px] font-semibold text-cyan">{detectedVerse}</span>
            <button className="rounded-lg bg-cyan/20 px-2 py-0.5 text-[9px] font-bold text-cyan transition-colors hover:bg-cyan/30">
              Show
            </button>
          </div>
        )}

        {/* Volume */}
        <div className="flex items-center gap-1.5">
          <Volume2 className="size-3.5 text-ink-faint" />
          <div className="h-1.5 w-14 overflow-hidden rounded-full bg-surface-4">
            <div className={`h-full rounded-full transition-all ${isListening ? "w-3/4 bg-success/60" : "w-1/4 bg-surface-5"}`} />
          </div>
        </div>

        {/* Expand */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="grid size-7 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-surface-4 hover:text-ink-muted"
        >
          <ChevronUp className={`size-3.5 transition-transform duration-200 ${expanded ? "" : "rotate-180"}`} />
        </button>
      </div>

      {/* Expanded transcript */}
      {expanded && (
        <div className="fade-in border-t border-line px-4 py-2">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[9px] font-bold uppercase tracking-widest text-ink-faint">Live Transcript</span>
            <div className="flex-1 border-t border-line-soft" />
            {isListening && <div className="live-dot size-1.5 rounded-full bg-danger" />}
          </div>
          <p className="text-[11px] leading-relaxed text-ink-muted">
            {isListening ? transcript : "Audio input is disabled. Click the microphone button to start listening."}
          </p>
        </div>
      )}
    </div>
  );
}
