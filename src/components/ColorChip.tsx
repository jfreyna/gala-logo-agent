/**
 * gala-color-chip (Figma 5540:4824): a swatch with a short label under it.
 * Square chips name a role (Primary); circle chips, used only in the kit's
 * ladders, show a hex. `base` outlines the chip that is the brand color.
 */
export function ColorChip({ color, label, shape = "square", base = false }: { color: string; label: string; shape?: "square" | "circle"; base?: boolean }) {
  return (
    <span
      className={`relative flex shrink-0 flex-col items-center gap-[4px] p-[4px] ${base ? "rounded-[8px] border border-solid border-stroke-2-light dark:border-stroke-2-dark" : ""}`}
      data-name="gala-color-chip"
    >
      <span
        className={`block size-[32px] shrink-0 border border-solid border-stroke-1-light dark:border-stroke-1-dark ${shape === "circle" ? "rounded-[999px]" : "rounded-[8px]"}`}
        style={{ backgroundColor: color }}
        data-name="swatch"
      />
      <span className="type-micro-semibold shrink-0 whitespace-nowrap text-text-neutral-1-light dark:text-text-neutral-1-dark">{label}</span>
    </span>
  );
}
