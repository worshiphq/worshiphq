import { cn } from "../../lib/utils";

const sizes = {
  xs: "size-7 text-[9px]",
  sm: "size-9 text-[10px]",
  md: "size-10 text-xs",
  lg: "size-14 text-lg",
  xl: "size-20 text-2xl",
};

const gradients = [
  "from-violet-500 to-purple-500",
  "from-blue-500 to-cyan-500",
  "from-emerald-500 to-teal-500",
  "from-orange-500 to-amber-500",
  "from-pink-500 to-rose-500",
  "from-indigo-500 to-blue-500",
  "from-teal-500 to-green-500",
  "from-red-500 to-orange-500",
];

function nameToGradient(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return gradients[Math.abs(hash) % gradients.length];
}

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

export function Avatar({
  name,
  src,
  size = "sm",
  className,
}: {
  name: string;
  src?: string | null;
  size?: keyof typeof sizes;
  className?: string;
}) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={cn("rounded-full object-cover shrink-0 ring-1 ring-white/10", sizes[size], className)}
      />
    );
  }

  return (
    <div
      className={cn(
        "shrink-0 grid place-items-center rounded-full bg-gradient-to-br font-semibold text-white ring-1 ring-white/10",
        sizes[size],
        nameToGradient(name),
        className
      )}
    >
      {getInitials(name)}
    </div>
  );
}
