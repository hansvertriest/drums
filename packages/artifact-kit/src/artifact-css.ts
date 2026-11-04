/** The classes artifacts use (spec §5.1). Listed for agents in core's artifact contract; keep the two in step. */
export const artifactCss = `
*,*::before,*::after{box-sizing:border-box}
html{height:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.55 var(--sans)}
.doc{max-width:880px;margin:0 auto;padding:24px 28px 48px}
h1{margin:0 0 6px;font-size:22px;font-weight:600;line-height:1.25}
h2{margin:0 0 8px;font-size:16px;font-weight:600}
h3{margin:0 0 6px;font-size:14px;font-weight:600}
p{margin:0 0 10px}
section{margin-top:22px}
code{font-family:var(--mono);font-size:.9em}
.hint,.muted{color:var(--muted)}
.hint{font-size:13px}
table{width:100%;border-collapse:collapse;background:var(--surface);border:1px solid var(--line);border-radius:12px;overflow:hidden}
th,td{padding:8px 12px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top}
th{font-weight:600;font-size:13px;color:var(--muted)}
tr:last-child td{border-bottom:0}
select,textarea,input[type=text],input[type=number]{font:inherit;color:inherit;background:var(--bg);border:1px solid var(--stroke);border-radius:8px;padding:6px 8px}
input[type=checkbox],input[type=radio]{accent-color:var(--accent);width:16px;height:16px;margin:0}
:disabled{opacity:.6;cursor:default}
.q{border:1px solid var(--line);border-radius:12px;padding:12px 14px;background:var(--surface);margin-bottom:10px}
.q p{margin:0;font-weight:500}
.q small{display:block;color:var(--muted);font-size:13px;margin-top:2px}
.q select,.q textarea,.q input[type=text],.notes textarea{width:100%;margin-top:8px}
.notes textarea{min-height:76px;resize:vertical}
.seg{display:inline-flex;border:1px solid var(--stroke);border-radius:8px;overflow:hidden;background:var(--surface)}
.seg label{position:relative;display:block}
.seg input{position:absolute;opacity:0;inset:0;width:100%;height:100%;margin:0;cursor:pointer}
.seg span{display:block;padding:3px 10px;font-size:12.5px;border-left:1px solid var(--line)}
.seg label:first-child span{border-left:0}
.seg input:checked+span{background:var(--accent);color:var(--on-accent)}
.seg input:focus-visible+span{outline:2px solid var(--accent);outline-offset:-2px}
.opts{display:grid;gap:8px}
.opts label{display:flex;gap:8px;align-items:center}
.call{border-radius:12px;padding:14px 16px;background:var(--accent-soft)}
.chg-on .chg{background:var(--accent-soft);box-shadow:0 0 0 2px color-mix(in srgb,var(--accent) 45%,transparent)}
.chg-on section.chg,.chg-on .q.chg{border-radius:14px;padding:12px 14px;margin-inline:-14px}
`;
