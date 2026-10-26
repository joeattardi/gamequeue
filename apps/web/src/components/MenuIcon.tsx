/**
 * The menu button's icon: three bars like the logo's queue (longest first) that turn into an ✕
 * when `open`. Used by both the hamburger and the full-screen menu's close button, which sit in
 * the same spot, so the bars morph in place as the menu opens and closes.
 */
export function MenuIcon({ open = false }: { open?: boolean }) {
    return (
        <svg
            className={open ? 'menu-icon is-open' : 'menu-icon'}
            viewBox="0 0 24 24"
            width="24"
            height="24"
            fill="currentColor"
            aria-hidden="true"
        >
            <rect
                className="menu-icon__bar menu-icon__bar--1"
                x="3"
                y="6"
                width="18"
                height="2.5"
                rx="1.25"
            />
            <rect
                className="menu-icon__bar menu-icon__bar--2"
                x="3"
                y="10.75"
                width="14"
                height="2.5"
                rx="1.25"
            />
            <rect
                className="menu-icon__bar menu-icon__bar--3"
                x="3"
                y="15.5"
                width="10"
                height="2.5"
                rx="1.25"
            />
        </svg>
    );
}
