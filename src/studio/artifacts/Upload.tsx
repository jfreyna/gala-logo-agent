/**
 * gala-upload (Figma 5585:13574): the visitor's message carrying a reference
 * file: the image, its name and size, then their words.
 */
export function Upload({ fileName, sizeLabel, imageUrl, text }: { fileName: string; sizeLabel: string; imageUrl: string | null; text: string }) {
  return (
    <div className="relative flex w-full shrink-0 items-start justify-end pl-[48px]" data-name="gala-upload">
      <div className="relative flex max-w-[480px] flex-col items-start gap-[8px] rounded-[8px] bg-background-1-light px-[16px] py-[12px] dark:bg-background-2-dark" data-name="bubble">
        <div className="relative flex shrink-0 flex-col items-start gap-[6px]" data-name="attachment">
          <div
            className="relative flex h-[160px] w-[240px] shrink-0 items-center justify-center overflow-clip rounded-[6px] border border-solid border-stroke-1-light bg-background-2-light dark:border-stroke-1-dark dark:bg-background-1-dark"
            data-name="image"
          >
            {imageUrl !== null && <img alt={fileName} src={imageUrl} className="max-h-full max-w-full object-contain" />}
          </div>
          <p className="type-mini-medium shrink-0 text-text-neutral-2-light dark:text-text-neutral-2-dark">
            {fileName} · {sizeLabel}
          </p>
        </div>
        {text.length > 0 && (
          <p className="type-body-regular w-full shrink-0 whitespace-pre-wrap text-text-neutral-1-light [word-break:break-word] dark:text-text-neutral-1-dark">{text}</p>
        )}
      </div>
    </div>
  );
}

/** "1.2 MB", "340 KB": a file's size the way the frame writes it. */
export function sizeLabel(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
