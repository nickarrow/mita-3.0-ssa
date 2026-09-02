import { useEffect } from "react";
import { APP_NAME } from "../constants/app";

const BASE_TITLE = APP_NAME;

/**
 * Set the document title for the current page.
 *
 * Every route previously shared one static title, so browser tabs, history
 * entries and bookmarks were indistinguishable, and screen readers announced the
 * same name on every navigation.
 */
export function usePageTitle(title?: string): void {
  useEffect(() => {
    document.title = title ? `${title} · ${BASE_TITLE}` : BASE_TITLE;
    return () => {
      document.title = BASE_TITLE;
    };
  }, [title]);
}
