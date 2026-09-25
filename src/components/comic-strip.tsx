import Image from "next/image";
import { cn } from "@/lib/utils";

const panels = [
  {
    src: "/art/panel-map.jpg",
    alt: "A night map of London with meeting rooms glowing along the river",
    label: "hunt the signal",
  },
  {
    src: "/art/panel-walk.jpg",
    alt: "Someone walking out of a chaotic bar toward a bright meeting",
    label: "march against the dark",
  },
  {
    src: "/art/panel-break.jpg",
    alt: "Someone breaking out of chaos into an open meeting door",
    label: "crush the chaos",
  },
  {
    src: "/art/panel-door.jpg",
    alt: "A wet East London street with an open meeting door and a chair inside",
    label: "claim your chair",
  },
] as const;

export function ComicStrip({
  compact = false,
}: {
  compact?: boolean;
}) {
  return (
    <section
      aria-label="blood against blackout comic"
      className={cn("comic-frame bg-black p-1.5", compact && "text-xs")}
    >
      <ul className="grid grid-cols-4 gap-2">
        {panels.map((panel, index) => (
          <li
            key={panel.src}
            className="min-w-0 border-2 border-warn bg-black p-1 shadow-[3px_3px_0_#ff2ad4]"
          >
            <div className="overflow-hidden border-2 border-black bg-black">
              <Image
                src={panel.src}
                alt={panel.alt}
                width={480}
                height={480}
                sizes="25vw"
                className="aspect-square h-auto w-full object-cover"
                priority={!compact && index < 2}
              />
            </div>
            <p className="relative z-10 mt-1 bg-[#ffe600] px-2 py-2 text-sm font-semibold leading-normal text-[#000]">
              {panel.label}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
