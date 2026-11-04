import { createContext, useContext } from 'react';

/** Opens the ⌘K palette from anywhere in the shell (the sidebar button, the tab bar, "/"). */
export interface SearchControls {
    openSearch: (query?: string) => void;
}

export const SearchContext = createContext<SearchControls>({ openSearch: () => {} });
export const useSearch = () => useContext(SearchContext);
