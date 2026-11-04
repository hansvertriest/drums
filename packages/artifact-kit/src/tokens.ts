const light = `
  --bg:#E8ECF0; --surface:#F8FAFB; --surface-2:#EEF2F5; --ink:#18202B; --muted:#535D6B; --line:#CBD3DC; --edge:#748397; --stroke:#7A889B;
  --accent:#3B4FD8; --accent-soft:#E2E6FB; --on-accent:#FFFFFF;
  --add:#157548; --add-bg:#DCF2E5; --del:#B03731; --del-bg:#F8E0DD; --mod:#905807; --mod-bg:#F5E9D2;
  --kw:#7A3BB8; --str:#1C7267; --dec:#A8530F; --com:#5C6671;
  --pr:#79438F; --pr-bg:#EFE3F4; --shadow:rgba(15,20,30,.14);
  --sans:"IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono:"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;`;

const dark = `
  --bg:#11151B; --surface:#192029; --surface-2:#202833; --ink:#E3E8EE; --muted:#95A0AE; --line:#2D3744; --edge:#657488; --stroke:#5E738E;
  --accent:#93A1FF; --accent-soft:#252C4F; --on-accent:#11151B;
  --add:#4FC48C; --add-bg:#16301F; --del:#F08A80; --del-bg:#3A1E1C; --mod:#E2AA4C; --mod-bg:#372A13;
  --kw:#C79BFF; --str:#6DD3C2; --dec:#F0A963; --com:#8B94A0; --pr:#C69BE0; --pr-bg:#33243D; --shadow:rgba(0,0,0,.45); color-scheme:dark;`;

/**
 * The dyffle viewer's color tokens, shared by the app and the artifacts. A string,
 * not a .css file, so the app and the artifact iframes take it from the public API.
 */
export const tokensCss = `:root{${light}}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${dark}}}
:root[data-theme="dark"]{${dark}}
`;
