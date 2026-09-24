import { useEffect, useMemo, useRef, useState } from 'preact/hooks';

type Item = {
  group: string;
  label: string;
  hint?: string;
  href?: string;
  external?: boolean;
  action?: 'copy-email' | 'toggle-theme';
};

type Props = { items: Item[]; email: string };

function score(item: Item, query: string): number {
  if (!query) return 1;
  const hay = `${item.label} ${item.hint ?? ''} ${item.group}`.toLowerCase();
  const q = query.toLowerCase().trim();
  if (hay.startsWith(q)) return 3;
  if (hay.includes(q)) return 2;
  // Loose subsequence match, so "mlk" finds "MilkRun".
  let i = 0;
  for (const ch of hay) if (ch === q[i]) i++;
  return i === q.length ? 1 : 0;
}

export default function CommandPalette({ items, email }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);

  const results = useMemo(
    () =>
      items
        .map((item) => ({ item, s: score(item, query) }))
        .filter((r) => r.s > 0)
        .sort((a, b) => (query ? b.s - a.s : 0))
        .map((r) => r.item),
    [items, query],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === '/' && !open && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('palette:open', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('palette:open', onOpen);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      lastFocus.current = document.activeElement as HTMLElement;
      setQuery('');
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
      document.documentElement.style.overflow = 'hidden';
    } else {
      document.documentElement.style.overflow = '';
      lastFocus.current?.focus?.();
    }
  }, [open]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  };

  const run = async (item: Item) => {
    if (item.action === 'copy-email') {
      try {
        await navigator.clipboard.writeText(email);
        flash('Email copied');
      } catch {
        window.location.href = `mailto:${email}`;
      }
      setOpen(false);
      return;
    }
    if (item.action === 'toggle-theme') {
      (document.querySelector('[data-theme-toggle]') as HTMLButtonElement | null)?.click();
      setOpen(false);
      return;
    }
    if (item.href) {
      setOpen(false);
      if (item.external) window.open(item.href, '_blank', 'noopener');
      else window.location.href = item.href;
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && results[active]) {
      e.preventDefault();
      run(results[active]);
    } else if (e.key === 'Tab') {
      e.preventDefault(); // keep focus inside the dialog
    }
  };

  let lastGroup = '';

  return (
    <>
      {toast && (
        <div
          role="status"
          class="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-lg border border-line bg-surface px-3.5 py-2 text-sm shadow-lg"
        >
          {toast}
        </div>
      )}
      {open && (
        <div class="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]" onKeyDown={onKeyDown}>
          <div class="absolute inset-0 bg-bg/60 backdrop-blur-sm" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Command menu"
            class="relative w-full max-w-lg overflow-hidden rounded-xl border border-line-strong bg-surface shadow-2xl"
          >
            <div class="flex items-center gap-3 border-b border-line px-4">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" class="text-faint" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                ref={inputRef}
                value={query}
                onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
                placeholder="Search pages, case studies, actions…"
                class="h-12 flex-1 bg-transparent text-[0.95rem] outline-none placeholder:text-faint"
                role="combobox"
                aria-expanded="true"
                aria-controls="palette-list"
                aria-activedescendant={results[active] ? `palette-item-${active}` : undefined}
                autocomplete="off"
                spellcheck={false}
              />
              <span class="kbd">esc</span>
            </div>
            <ul ref={listRef} id="palette-list" role="listbox" class="max-h-[50vh] overflow-y-auto p-2">
              {results.length === 0 && <li class="px-3 py-6 text-center text-sm text-faint">Nothing matches “{query}”.</li>}
              {results.map((item, i) => {
                const header = item.group !== lastGroup && !query ? item.group : null;
                lastGroup = item.group;
                return (
                  <>
                    {header && (
                      <li role="presentation" class="eyebrow px-3 pt-3 pb-1.5">
                        {header}
                      </li>
                    )}
                    <li
                      id={`palette-item-${i}`}
                      data-index={i}
                      role="option"
                      aria-selected={i === active}
                      onMouseMove={() => setActive(i)}
                      onClick={() => run(item)}
                      class={`flex cursor-pointer items-center justify-between gap-4 rounded-lg px-3 py-2.5 text-sm ${
                        i === active ? 'bg-elev text-fg' : 'text-muted'
                      }`}
                    >
                      <span class="truncate">{item.label}</span>
                      <span class="flex shrink-0 items-center gap-2 font-mono text-[0.7rem] text-faint">
                        {item.hint && <span class="hidden truncate sm:inline">{item.hint}</span>}
                        {item.external ? '↗' : i === active ? '↵' : ''}
                      </span>
                    </li>
                  </>
                );
              })}
            </ul>
            <div class="flex items-center gap-4 border-t border-line px-4 py-2.5 font-mono text-[0.68rem] text-faint">
              <span>
                <span class="kbd">↑</span> <span class="kbd">↓</span> navigate
              </span>
              <span>
                <span class="kbd">↵</span> open
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
