import { useEffect, useMemo, useRef, useState } from "react";

export type HeroMeta = { id: number; name: string; localized_name: string };

export function heroLabel(h: HeroMeta): string {
  return h.localized_name || h.name || `Hero ${h.id}`;
}

function matchesHero(h: HeroMeta, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return (
    heroLabel(h).toLowerCase().includes(needle) ||
    h.name.toLowerCase().includes(needle) ||
    String(h.id).includes(needle)
  );
}

export function HeroSearchSelect({
  heroes,
  value,
  onChange,
  placeholder = "Type to search heroes…",
}: {
  heroes: HeroMeta[];
  value: string;
  onChange: (heroId: string) => void;
  placeholder?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = useMemo(
    () => heroes.find((h) => String(h.id) === value),
    [heroes, value],
  );

  const filtered = useMemo(
    () => heroes.filter((h) => matchesHero(h, query)),
    [heroes, query],
  );

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function openList() {
    setOpen(true);
    setQuery(selected ? heroLabel(selected) : "");
  }

  function pick(hero: HeroMeta) {
    onChange(String(hero.id));
    setQuery(heroLabel(hero));
    setOpen(false);
    inputRef.current?.blur();
  }

  function clear() {
    onChange("");
    setQuery("");
  }

  const inputValue = open ? query : selected ? heroLabel(selected) : "";

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          autoComplete="off"
          className="w-full rounded-lg border border-white/10 bg-slate-950 py-2 pl-3 pr-9 text-white placeholder:text-slate-500"
          placeholder={placeholder}
          value={inputValue}
          onFocus={openList}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (value) onChange("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              inputRef.current?.blur();
            }
            if (e.key === "Enter" && open && filtered[0]) {
              e.preventDefault();
              pick(filtered[0]);
            }
          }}
        />
        {value ? (
          <button
            type="button"
            aria-label="Clear hero"
            className="absolute right-7 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            onMouseDown={(e) => e.preventDefault()}
            onClick={clear}
          >
            ×
          </button>
        ) : null}
        <span
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500"
          aria-hidden
        >
          ▾
        </span>
      </div>

      {open ? (
        <ul
          role="listbox"
          className="absolute z-30 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-white/15 bg-slate-950 py-1 shadow-xl"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-500">No heroes found</li>
          ) : (
            filtered.map((h) => {
              const active = String(h.id) === value;
              return (
                <li key={h.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-white/10 ${
                      active ? "bg-emerald-500/20 text-emerald-200" : "text-white"
                    }`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(h)}
                  >
                    {heroLabel(h)}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}
