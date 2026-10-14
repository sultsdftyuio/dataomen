import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { SOURCE_OPTIONS } from "./group-fields";

/** Public sources as a checkbox group. Each whole tile toggles its source. */
export function SourcePicker({
  idPrefix,
  sources,
  onToggle,
  error,
  legend = "Public sources",
  legendClassName = "sr-only",
}: {
  idPrefix: string;
  sources: string[];
  onToggle: (source: string) => void;
  error?: string;
  legend?: string;
  legendClassName?: string;
}) {
  const errorId = `${idPrefix}-sources-error`;

  return (
    <fieldset aria-describedby={error ? errorId : undefined}>
      <legend className={legendClassName}>{legend}</legend>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {SOURCE_OPTIONS.map((source, index) => {
          const checked = sources.includes(source.value);
          const id = index === 0 ? `${idPrefix}-sources` : `${idPrefix}-source-${source.value}`;
          return (
            <label
              key={source.value}
              htmlFor={id}
              className={cn(
                "flex cursor-pointer items-start gap-2.5 rounded-md border p-3 text-left transition-colors",
                checked ? "border-primary/40 bg-blue-tint" : "border-border bg-card hover:bg-off-white",
              )}
            >
              <Checkbox id={id} checked={checked} onCheckedChange={() => onToggle(source.value)} className="mt-0.5" />
              <span className="min-w-0">
                <span className="block text-sm leading-5 font-medium text-foreground">{source.label}</span>
                <span className="block text-xs leading-5 text-subtle">{source.detail}</span>
              </span>
            </label>
          );
        })}
      </div>
      {error ? (
        <p id={errorId} className="mt-2 text-sm leading-5 font-medium text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
