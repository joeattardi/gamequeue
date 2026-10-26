import type { FacetCountsDto } from '@gamequeue/shared';
import { useState, type ReactNode } from 'react';

export const FACET_KEYS = ['status', 'platform', 'genre', 'series', 'tag', 'favorite'] as const;
export type FacetKey = (typeof FACET_KEYS)[number];

interface Option {
    value: string;
    label: string;
    count: number;
}

const COLLAPSED_LIMIT = 8;
const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

/**
 * Faceted filters for the collection. Values within a facet are any-of, facets combine with AND;
 * counts show how many games each option would match given the other facets.
 */
export function FacetSidebar({
    facets,
    selected,
    onToggle,
    onClear,
    showStatus,
    open,
    sort
}: {
    facets: FacetCountsDto | undefined;
    selected: (key: FacetKey) => string[];
    onToggle: (key: FacetKey, value: string) => void;
    onClear: () => void;
    showStatus: boolean;
    /** Narrow screens only: whether the panel is shown (the page's Filters button toggles it). */
    open: boolean;
    /** Narrow screens only: the sort control, which sits in the page's search bar on wide ones. */
    sort: ReactNode;
}) {
    const groups: { key: FacetKey; title: string; options: Option[] }[] = facets
        ? [
              ...(showStatus
                  ? [
                        {
                            key: 'status' as const,
                            title: 'Status',
                            options: facets.statuses.map((s) => ({
                                value: s.value,
                                label: cap(s.value),
                                count: s.count
                            }))
                        }
                    ]
                  : []),
              {
                  key: 'platform',
                  title: 'Platform',
                  options: facets.platforms.map((p) => ({
                      value: String(p.id),
                      label: p.name,
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
                  title: 'Tag',
                  options: facets.tags.map((t) => ({
                      value: t.name,
                      label: t.name,
                      count: t.count
                  }))
              },
              {
                  key: 'favorite',
                  title: 'Favorites',
                  options: [{ value: 'true', label: 'Favorites only', count: facets.favorites }]
              }
          ]
        : [];
    const active = FACET_KEYS.reduce((n, k) => n + selected(k).length, 0);

    // Always shown beside the results on wide screens; under 900px it is a panel above the results
    // that the page's Filters button opens
    return (
        <div className={open ? 'facets' : 'facets facets--closed'}>
            <div className="facets__clip">
                <div className="facets__body" id="collection-facets">
                    <div className="facets__sort">{sort}</div>
                    <div className="facets__head">
                        <h2>Filters</h2>
                        {active > 0 && (
                            <button type="button" className="btn btn--ghost" onClick={onClear}>
                                Clear all
                            </button>
                        )}
                    </div>
                    {!facets ? (
                        <FacetSkeletons />
                    ) : (
                        groups
                            .map((g) => ({
                                ...g,
                                // Options that would match nothing are hidden unless ticked
                                options: g.options.filter(
                                    (o) => o.count > 0 || selected(g.key).includes(o.value)
                                )
                            }))
                            .filter((g) => g.options.length > 0)
                            .map((g) => (
                                <FacetGroup
                                    key={g.key}
                                    title={g.title}
                                    options={g.options}
                                    selected={selected(g.key)}
                                    onToggle={(v) => onToggle(g.key, v)}
                                />
                            ))
                    )}
                </div>
            </div>
        </div>
    );
}

function FacetGroup({
    title,
    options,
    selected,
    onToggle
}: {
    title: string;
    options: Option[];
    selected: string[];
    onToggle: (value: string) => void;
}) {
    const [expanded, setExpanded] = useState(false);
    // Ticked options first so they stay visible when the list is collapsed
    const ranked = [...options].sort(
        (a, b) => Number(selected.includes(b.value)) - Number(selected.includes(a.value))
    );
    const shown = expanded ? ranked : ranked.slice(0, COLLAPSED_LIMIT);
    return (
        <fieldset className="facet">
            <legend>{title}</legend>
            <ul>
                {shown.map((o) => {
                    const checked = selected.includes(o.value);
                    return (
                        <li key={o.value}>
                            <label className="facet__option">
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => onToggle(o.value)}
                                />
                                <span className="facet__label">{o.label}</span>
                                <span className="facet__count">{o.count}</span>
                            </label>
                        </li>
                    );
                })}
            </ul>
            {options.length > COLLAPSED_LIMIT && (
                <button
                    type="button"
                    className="facet__more"
                    aria-expanded={expanded}
                    onClick={() => setExpanded((e) => !e)}
                >
                    {expanded ? 'Show fewer' : `Show all ${options.length}`}
                </button>
            )}
        </fieldset>
    );
}

/** Placeholder with the sidebar's own classes, shown on the first load. */
export function FacetSkeletons() {
    return (
        <div role="status" aria-label="Loading filters">
            {[5, 6, 4].map((rows, g) => (
                <div key={g} className="facet facet--skeleton" aria-hidden="true">
                    <span className="skeleton skeleton--line skeleton--facet-title" />
                    <ul>
                        {Array.from({ length: rows }, (_, i) => (
                            <li key={i}>
                                <span
                                    className="skeleton skeleton--line skeleton--facet-option"
                                    style={{ width: `${88 - ((i * 17) % 40)}%` }}
                                />
                            </li>
                        ))}
                    </ul>
                </div>
            ))}
        </div>
    );
}
