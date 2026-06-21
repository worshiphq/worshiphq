export default function RootLoading() {
  return (
    <div className="grid min-h-screen place-items-center bg-base" style={{ animation: "fade-in 0.3s ease-out 0.15s both" }}>
      <div className="relative flex items-center justify-center">
        {/* Spinning ring */}
        <span
          aria-hidden="true"
          className="absolute size-20 rounded-full border-[3px] border-primary/20"
        />
        <span
          aria-hidden="true"
          className="whq-spin absolute size-20 rounded-full border-[3px] border-transparent border-t-primary-bright"
        />
        {/* Icon fading in and out */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icon2.png"
          alt=""
          className="size-12 object-contain"
          style={{ animation: "icon-pulse 2s ease-in-out infinite" }}
        />
      </div>
    </div>
  );
}
