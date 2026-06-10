import { cn, initials } from "@/lib/utils";

const GRADIENTS = [
  "from-[#0d9488] to-[#14b8a6]",
  "from-[#E5B567] to-[#C9954F]",
  "from-[#34D399] to-[#059669]",
  "from-[#60A5FA] to-[#2563EB]",
  "from-[#F472B6] to-[#DB2777]",
  "from-[#22D3EE] to-[#0891B2]",
];

function gradientFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h << 5) - h + name.charCodeAt(i);
  return GRADIENTS[Math.abs(h) % GRADIENTS.length];
}

export function Avatar({
  name,
  src,
  size = "md",
  className,
}: {
  name: string;
  src?: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  const dim = { xs: "size-7 text-[10px]", sm: "size-9 text-xs", md: "size-10 text-sm", lg: "size-14 text-lg" }[size];
  return (
    <span
      className={cn(
        "relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full font-semibold text-white ring-1 ring-white/10",
        !src && `bg-gradient-to-br ${gradientFor(name)}`,
        dim,
        className,
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} className="size-full object-cover" />
      ) : (
        initials(name)
      )}
    </span>
  );
}
