// The ? button of a page header (and F1) opens the wiki topics about the page on screen.
// App.tsx listens for this event and knows which page that is.

export const PAGE_HELP_EVENT = 'vc-page-help'

export function openPageHelp(): void {
  window.dispatchEvent(new Event(PAGE_HELP_EVENT))
}
