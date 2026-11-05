import type { FacetCountsDto } from '@gamequeue/shared';
import { ChevronDown, Heart, Search, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { SORT_OPTIONS, facetButtonLabel, showFacet } from '../collectionModel';

export type FacetKey = 'platform' | 'genre' | 'series' | 'tag' | 'favorite';
export const FACET_KEYS: FacetKey[] = ['platform', 'genre', 'series', 'tag', 'favorite'];

interface Option {
    value: string;
    label: string;
    count: number;
}

/** More options than this get a small search box in the menu. */
const SEARCHABLE_AT = 10;

/**
 * One filter as a compact chip with a menu of checkboxes. With something selected the chip is
 * outlined in the accent colour and gets a clear button.
 */
function FilterMenu({
    title,
    options,
    selected,
    onToggle,
    onClear
}: {
    title: string;
    options: Option[];
    selected: string[];
    onToggle: (value: string) => void;
    onClear: () => void;
}) {
    const [open, setOpen] = useState(false);
    const [text, setText] = useState('');
    const root = useRef<HTMLDivElement>(null);
    const button = useRef<HTMLButtonElement>(null);
    const panelId = useId();
    const shown = useMemo(
        () => options.filter((o) => o.label.toLowerCase().includes(text.trim().toLowerCase())),
        [options, text]
    );
    const names = selected.map((v) => options.find((o) => o.value === v)?.label ?? v);

    useEffect(() => {
        if (!open) return;
        const onPointer = (e: PointerEvent) => {
            if (!root.current?.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            e.stopPropagation();
            setOpen(false);
            button.current?.focus();
        };
        document.addEventListener('pointerdown', onPointer);
        document.addEventListener('keydown', onKey, true);
        return () => {
            document.removeEventListener('pointerdown', onPointer);
            document.removeEventListener('keydown', onKey, true);
        };
    }, [open]);

    return (
        <div
            ref={root}
            className={selected.length ? 'fmenu fmenu--active' : 'fmenu'}
            onBlur={(e) => {
                // Tabbing out closes the menu. Focus landing nowhere (a click on a label inside it)
                // doesn't: clicks elsewhere close it through the pointer handler above.
                if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node))
                    setOpen(false);
            }}
        >
            <button
                ref={button}
                type="button"
                className="fmenu__btn"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpen((o) => !o)}
            >
                {facetButtonLabel(title, names)}
                <ChevronDown aria-hidden="true" />
            </button>
            {selected.length > 0 && (
                <button
                    type="button"
                    className="fmenu__clear"
                    aria-label={`Clear ${title} filter`}
                    onClick={onClear}
                >
                    <X aria-hidden="true" />
                </button>
            )}
            {open && (
                <div
                    className="fmenu__panel"
                    id={panelId}
                    role="group"
                    aria-label={title}
                    // A mouse press inside must not move focus to the page behind (the main
                    // area is focusable), or the menu would close before the click lands
                    onMouseDown={(e) => {
                        if (!(e.target as HTMLElement).closest('input[type="search"]'))
                            e.preventDefault();
                    }}
                >
                    {options.length > SEARCHABLE_AT && (
                        <label className="fmenu__search">
                            <Search aria-hidden="true" />
                            <span className="sr-only">Search {title.toLowerCase()}</span>
                            <input
                                type="search"
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                                placeholder={`Search ${title.toLowerCase()}…`}
                                autoFocus
                            />
                        </label>
                    )}
                    <ul className="fmenu__list">
                        {shown.map((o) => (
                            <li key={o.value}>
                                <label className="fmenu__opt">
                                    <input
                                        type="checkbox"
                                        checked={selected.includes(o.value)}
                                        onChange={() => onToggle(o.value)}
                                    />
                                    <span className="fmenu__label">{o.label}</span>
                                    <span className="fmenu__count">{o.count}</span>
                                </label>
                            </li>
                        ))}
                        {shown.length === 0 && <li className="muted fmenu__none">No matches.</li>}
                    </ul>
                </div>
            )}
        </div>
    );
}

/**
 * The compact bar of filters above the games: Platform, Genre, Series and My tags as chip menus
 * (a menu with one option is hidden unless something is selected in it), a Favorites toggle, and
 * the sort. It replaces the old panel on the right.
 */
export function FilterBar({
    facets,
    selected,
    onToggle,
    onClear,
    onClearAll,
    favorite,
    onFavorite,
    sort,
    onSort
}: {
    facets: FacetCountsDto | undefined;
    selected: (key: FacetKey) => string[];
    onToggle: (key: FacetKey, value: string) => void;
    onClear: (key: FacetKey) => void;
    onClearAll: () => void;
    favorite: boolean;
    onFavorite: () => void;
    sort: string;
    onSort: (value: string) => void;
}) {
    const groups: { key: FacetKey; title: string; options: Option[] }[] = facets
        ? [
              {
                  key: 'platform',
                  title: 'Platform',
                  options: facets.platforms.map((p) => ({
                      value: String(p.id),
                      label: p.abbreviation ?? p.name,
                      count: p.count
                  }))
              },
              {
                  key: 'genre',
                  title: 'Genre',
                  options: facets.genres.map((g) => ({
                      value: String(g.id),
                      label: g.name,
                      count: g.count
                  }))
              },
              {
                  key: 'series',
                  title: 'Series',
                  options: facets.series.map((s) => ({
                      value: String(s.id),
                      label: s.name,
                      count: s.count
                  }))
              },
              {
                  key: 'tag',
                  title: 'My tags',
                  options: facets.tags.map((t) => ({
                      value: t.name,
                      label: t.name,
                      count: t.count
                  }))
              }
          ]
        : [];
    const any = FACET_KEYS.some((k) => (k === 'favorite' ? favorite : selected(k).length > 0));
    return (
        <div className="fbar">
            <div className="fbar__filters" role="group" aria-label="Filters">
                {!facets &&
                    [0, 1, 2].map((i) => (
                        <span key={i} className="skeleton fbar__skeleton" aria-hidden="true" />
                    ))}
                {groups
                    .filter((g) => showFacet(g.options.length, selected(g.key).length))
                    .map((g) => (
                        <FilterMenu
                            key={g.key}
                            title={g.title}
                            options={g.options}
                            selected={selected(g.key)}
                            onToggle={(v) => onToggle(g.key, v)}
                            onClear={() => onClear(g.key)}
                        />
                    ))}
                {facets && (facets.favorites > 0 || favorite) && (
                    <button
                        type="button"
                        className={favorite ? 'fchip fchip--active' : 'fchip'}
                        aria-pressed={favorite}
                        onClick={onFavorite}
                    >
                        <Heart aria-hidden="true" />
                        Favorites
                        <span className="fmenu__count">{facets.favorites}</span>
                    </button>
                )}
                {any && (
                    <button type="button" className="fbar__clear" onClick={onClearAll}>
                        Clear filters
                    </button>
                )}
            </div>
            <label className="fbar__sort">
                <span>Sort</span>
                <select value={sort} onChange={(e) => onSort(e.target.value)}>
                    {SORT_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                            {o.label}
                        </option>
                    ))}
                </select>
            </label>
        </div>
    );
}
