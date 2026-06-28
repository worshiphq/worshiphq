import Image from "next/image";

export default function AppLoading() {
  return (
    <div className="grid min-h-[60vh] place-items-center" style={{ animation: "fade-in 0.3s ease-out 0.15s both" }}>
      <div className="relative flex items-center justify-center">
        <span
          aria-hidden="true"
          className="absolute size-20 rounded-full border-[3px] border-primary/20"
        />
        <span
          aria-hidden="true"
          className="whq-spin absolute size-20 rounded-full border-[3px] border-transparent border-t-primary-bright"
        />
        <Image
          src="/icon2.png"
          alt=""
          width={48}
          height={48}
          className="size-12 object-contain"
          style={{ animation: "icon-pulse 2s ease-in-out infinite" }}
          priority
        />
      </div>
    </div>
  );
}
