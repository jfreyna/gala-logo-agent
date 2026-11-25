import { useRef, useState } from "react";
import { ColorChip } from "../../components/ColorChip";
import { Icon } from "../../components/Icon";
import { parseHex, toHex } from "../../lib/color";
import type { BrandColors, ColorPickerArtifact } from "./types";
import { ArtifactCard, Turn } from "./Turn";

type EyeDropperWindow = Window & { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } };

/**
 * gala-color-field (Figma 5544:6799): one brand color. A square swatch with
 * an eyedropper, and a hex field; hex is the only format.
 */
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const colorInput = useRef<HTMLInputElement>(null);
  const parsed = parseHex(value);
  const filled = parsed !== null;

  async function pick() {
    const Dropper = (window as EyeDropperWindow).EyeDropper;
    if (Dropper) {
      try {
        const result = await new Dropper().open();
        onChange(result.sRGBHex.toUpperCase());
      } catch {
        // The person pressed Escape; nothing changes.
      }
      return;
    }
    colorInput.current?.click();
  }

  return (
    <div className="relative flex w-full shrink-0 flex-col items-start gap-[8px] desktop:w-auto desktop:min-w-px desktop:flex-[1_0_0]" data-name="gala-color-field">
      <p className={`type-caption-medium shrink-0 ${filled ? "text-text-neutral-1-light dark:text-text-neutral-1-dark" : "text-text-neutral-2-light dark:text-text-neutral-2-dark"}`}>
        {label}
      </p>
      <div className="relative flex w-full shrink-0 items-center gap-[12px]" data-name="input">
        <div
          className={`relative flex h-[36px] w-[48px] shrink-0 items-center justify-center rounded-[4px] border ${filled ? "border-solid border-neutral-500" : "border-dashed border-neutral-300 bg-neutral-100"}`}
          style={filled ? { backgroundColor: toHex(parsed) } : undefined}
          data-name="swatch"
        >
          <button
            type="button"
            onClick={pick}
            aria-label={`Pick the ${label.toLowerCase()} color`}
            className={`relative flex size-[20px] shrink-0 items-center justify-center rounded-[999px] border border-solid ${
              filled
                ? "border-text-blue-1-light bg-brand-tertiary-50 text-text-blue-1-light dark:border-text-blue-1-dark dark:bg-background-1-dark dark:text-text-blue-1-dark"
                : "border-neutral-300 bg-neutral-0 text-text-blue-1-light"
            }`}
            data-name="eyedropper"
          >
            <Icon name="eyedropper" />
          </button>
          <input
            ref={colorInput}
            type="color"
            tabIndex={-1}
            aria-hidden="true"
            value={filled ? toHex(parsed).toLowerCase() : "#ffffff"}
            onChange={(event) => onChange(event.target.value.toUpperCase())}
            className="pointer-events-none absolute inset-0 size-full opacity-0"
          />
        </div>
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="#B83A1B"
          aria-label={`${label} hex`}
          spellCheck={false}
          maxLength={7}
          className={`type-body-regular h-[36px] min-w-px flex-[1_0_0] rounded-[6px] border border-solid border-form-stroke-light bg-form-background-light px-[12px] text-text-neutral-1-light outline-none placeholder:text-text-neutral-2-light dark:border-form-stroke-dark dark:bg-form-background-dark dark:text-text-neutral-1-dark dark:placeholder:text-text-neutral-2-dark ${filled ? "" : "opacity-60"}`}
          data-name="hex-field"
        />
      </div>
    </div>
  );
}

/**
 * gala-color-picker (Figma 5544:7036). Editing: Primary, Secondary and an
 * optional Tertiary, then Save colors. Saved: one swatch per role, named by
 * role and never by hex, with Edit.
 */
export function ColorPicker({ data, onSave, onEdit }: { data: ColorPickerArtifact; onSave: (colors: BrandColors) => void; onEdit: () => void }) {
  const [primary, setPrimary] = useState(data.colors?.primary ?? "");
  const [secondary, setSecondary] = useState(data.colors?.secondary ?? "");
  const [tertiary, setTertiary] = useState(data.colors?.tertiary ?? "");

  function save() {
    const first = parseHex(primary);
    const second = parseHex(secondary);
    const third = tertiary.trim() === "" ? null : parseHex(tertiary);
    if (first === null || second === null || (tertiary.trim() !== "" && third === null)) return;
    onSave({ primary: toHex(first), secondary: toHex(second), tertiary: third === null ? null : toHex(third) });
  }

  return (
    <div className="relative flex w-full shrink-0 flex-col items-start gap-[12px]" data-name="gala-color-picker">
      <Turn>{data.say}</Turn>
      <ArtifactCard name="colors">
        {data.saved && data.colors !== null ? (
          <div className="relative flex w-full shrink-0 items-center justify-between" data-name="saved">
            <div className="relative flex shrink-0 items-start gap-[12px]" data-name="chips">
              <ColorChip color={data.colors.primary} label="Primary" />
              <ColorChip color={data.colors.secondary} label="Secondary" />
              {data.colors.tertiary !== null && <ColorChip color={data.colors.tertiary} label="Tertiary" />}
            </div>
            <button type="button" onClick={onEdit} className="type-caption-semibold shrink-0 text-text-blue-1-light dark:text-text-blue-1-dark">
              Edit
            </button>
          </div>
        ) : (
          <>
            <div className="relative flex w-full shrink-0 flex-col items-start gap-[16px] desktop:flex-row" data-name="fields">
              <ColorField label="PRIMARY" value={primary} onChange={setPrimary} />
              <ColorField label="SECONDARY" value={secondary} onChange={setSecondary} />
              <ColorField label="TERTIARY (optional)" value={tertiary} onChange={setTertiary} />
            </div>
            <div className="relative flex w-full shrink-0 items-start justify-end" data-name="footer">
              <button
                type="button"
                onClick={save}
                className="relative flex h-[40px] w-full shrink-0 items-center justify-center rounded-[12px] bg-button-1-default-light px-[20px] desktop:w-auto dark:bg-button-1-default-dark"
                data-name="save"
              >
                <span className="type-caption-semibold shrink-0 text-button-light-text">Save colors</span>
              </button>
            </div>
          </>
        )}
      </ArtifactCard>
    </div>
  );
}
