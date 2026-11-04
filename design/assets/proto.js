/* Bible CLI — clickable UX prototype. No framework; hash routing + a few sheets.
   Greek/Hebrew data comes from bible-cli (data-v0.2.x). BSB rendering counts are
   approximations (verse-level text matches) until the alignment stage lands. */

const MENO_LEX = {
  lemma: "μένω", tr: "menō", strongs: "G3306", pos: "verb", gloss: "I remain, abide",
  count: "118 in 102 verses",
  rend: [["remain", 45], ["stay", 24], ["abide", 9], ["continue", 6], ["endure", 4], ["other", 14]],
  dist: { labels: ["Matt", "John", "Acts", "1 John", "Rev"], vals: [3,2,7,40,13,1,8,3,0,0,1,0,0,0,1,3,0,0,6,0,2,0,24,3,0,0,1], hi: [3, 22] },
  lex: "<b>Dodson:</b> I remain, abide, stay, wait; with acc.: I wait for, await.<br><b>Abbott-Smith:</b> to stay, abide, remain — of place, of time (persons; things lasting or enduring), of condition. Of Christ and of Christians, John 6:56; 15:4; 1 John 4:15.",
  occ: [
    ["John 1:32", "I saw the Spirit descending from heaven like a dove and <mark>resting</mark> on Him."],
    ["John 1:38", "“Rabbi” (which means Teacher), “where are You <mark>staying</mark>?”"],
    ["John 6:56", "Whoever eats My flesh and drinks My blood <mark>remains</mark> in Me, and I in him."],
    ["John 8:31", "“If you <mark>continue</mark> in My word, you are truly My disciples."],
    ["1 John 2:24", "let what you have heard from the beginning <mark>remain</mark> in you."]
  ]
};

const WORDS = {
  meinate: { ...MENO_LEX, form: "μείνατε", ftr: "meinate", in: "Remain", morph: "V-AAM-2P",
    parse: "A command to a group — <b>“remain!”</b> Aorist · active · imperative · 2nd person plural." },
  mene: { ...MENO_LEX, form: "μένῃ", ftr: "menē", in: "remains", morph: "V-PAS-3S",
    parse: "Present · active · subjunctive · 3rd person singular. After ἐὰν μή: <b>“unless it remains.”</b>" },
  menete: { ...MENO_LEX, form: "μένητε", ftr: "menēte", in: "remain", morph: "V-PAS-2P",
    parse: "Present · active · subjunctive · 2nd person plural — <b>“unless you remain.”</b>" },
  menon: { ...MENO_LEX, form: "μένων", ftr: "menōn", in: "remains", morph: "V-PAP-NSM",
    parse: "Present · active · participle · masculine singular — <b>“the one who remains,”</b> an ongoing state." },
  ampelo: { lemma: "ἄμπελος", tr: "ampelos", strongs: "G0288", pos: "noun", gloss: "a vine", form: "ἀμπέλῳ", ftr: "ampelō", in: "the vine", morph: "N-DSF",
    parse: "Noun · feminine · singular · dative — <b>“in the vine.”</b>", count: "9 in 9 verses",
    rend: [["vine", 7], ["grapevine", 1]], dist: { labels: ["Matt", "John", "Rev"], vals: [1,1,1,3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,2], hi: [3] },
    lex: "<b>Dodson:</b> a vine, grape-vine.",
    occ: [["John 15:1", "“I am the true <mark>vine</mark>, and My Father is the keeper of the vineyard."], ["John 15:5", "I am the <mark>vine</mark> and you are the branches."]] },
  ampelos: null, // filled below
  klema: { lemma: "κλῆμα", tr: "klēma", strongs: "G2814", pos: "noun", gloss: "a branch, shoot", form: "κλῆμα", ftr: "klēma", in: "branch", morph: "N-NSN",
    parse: "Noun · neuter · singular · nominative (subject).", count: "4 in 4 verses — all in John 15",
    rend: [["branch", 4]], dist: { labels: ["Matt", "John", "Rev"], vals: [0,0,0,4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], hi: [3] },
    lex: "<b>Dodson:</b> a branch, shoot, twig.",
    occ: [["John 15:2", "He cuts off every <mark>branch</mark> in Me that bears no fruit…"], ["John 15:6", "he is like a <mark>branch</mark> that is thrown away and withers."]] },
  klemata: null,
  karpon: { lemma: "καρπός", tr: "karpos", strongs: "G2590", pos: "noun", gloss: "fruit, result, gain", form: "καρπὸν", ftr: "karpon", in: "fruit", morph: "N-ASM",
    parse: "Noun · masculine · singular · accusative (direct object).", count: "66 in 56 verses",
    rend: [["fruit", 42], ["crop", 9], ["produce", 8], ["harvest", 7]], dist: { labels: ["Matt", "John", "Rev"], vals: [19,5,12,10,1,4,1,0,1,1,3,0,0,0,0,1,0,0,2,4,0,0,0,0,0,0,2], hi: [3] },
    lex: "<b>Dodson:</b> (a) fruit, generally vegetable, sometimes animal; (b) metaphorically: fruit, deed, action, result; (c) profit, gain.",
    occ: [["John 15:8", "This is to My Father’s glory, that you bear much <mark>fruit</mark>…"]] },
  pherein: { lemma: "φέρω", tr: "pherō", strongs: "G5342", pos: "verb", gloss: "I carry, bear, bring, lead", form: "φέρειν", ftr: "pherein", in: "bear", morph: "V-PAN",
    parse: "Present · active · infinitive — <b>“to bear.”</b>", count: "66 in 60 verses",
    rend: [["brought", 18], ["bring", 16], ["bear", 9], ["carry", 5], ["lead", 4]], dist: { labels: ["Matt", "John", "Rev"], vals: [4,15,4,17,10,1,0,0,0,0,0,0,0,0,0,1,0,0,5,0,1,5,0,1,0,0,2], hi: [3] },
    lex: "<b>Dodson:</b> I carry, bear, bring; I conduct, lead; perhaps: I make publicly known.", occ: [] },
  pherei: null,
  polun: { lemma: "πολύς", tr: "polus", strongs: "G4183", pos: "adjective", gloss: "much, many, often", form: "πολύν", ftr: "polun", in: "much", morph: "A-ASM",
    parse: "Adjective · masculine · singular · accusative — agrees with καρπόν.", count: "367 in 331 verses",
    rend: [["many", 180], ["great", 48], ["large", 33], ["much", 31], ["more", 26]], dist: { labels: ["Matt", "John", "Rev"], vals: [52,59,51,37,54,21,18,21,3,1,3,1,4,0,5,2,2,2,7,3,1,1,2,2,1,0,14], hi: [] },
    lex: "<b>Dodson:</b> much, many; often.", occ: [] },
  choris: { lemma: "χωρίς", tr: "chōris", strongs: "G5565", pos: "preposition", gloss: "apart from, without", form: "χωρὶς", ftr: "chōris", in: "apart from", morph: "PREP",
    parse: "Preposition, takes the genitive (ἐμοῦ, “Me”).", count: "41 in 38 verses",
    rend: [["without", 22], ["apart from", 7], ["besides", 2], ["separate", 2]], dist: { labels: ["Matt", "John", "Rev"], vals: [3,1,1,3,0,6,3,2,0,1,1,0,0,0,2,0,0,1,13,4,0,0,0,0,0,0,0], hi: [18] },
    lex: "<b>Dodson:</b> apart from, separately from; without.", occ: [] },
  ouden: { lemma: "οὐδείς", tr: "oudeis", strongs: "G3762", pos: "adjective", gloss: "no one, none, nothing", form: "οὐδέν", ftr: "ouden", in: "nothing", morph: "A-ASN",
    parse: "Adjective · neuter · singular · accusative — <b>“nothing.”</b> With οὐ: a double negative for emphasis.", count: "232 in 219 verses",
    rend: [["no", 125], ["no one", 87], ["nothing", 45], ["anyone", 16]], dist: { labels: ["Matt", "John", "Rev"], vals: [19,26,35,51,28,4,19,8,8,1,3,0,0,0,3,3,1,1,6,2,0,0,2,0,0,0,12], hi: [3] },
    lex: "<b>Dodson:</b> no one, none, nothing.", occ: [] },
  emoi: { lemma: "ἐγώ", tr: "egō", strongs: "G1473", pos: "pronoun", gloss: "I", form: "ἐμοὶ", ftr: "emoi", in: "Me", morph: "P-1DS",
    parse: "Pronoun · 1st person · singular · dative — after ἐν: <b>“in Me.”</b>", count: "841 in 659 verses",
    rend: [["Me / me", 0], ["I", 0], ["My", 0]], dist: { labels: ["Matt", "John", "Rev"], vals: [76,33,66,309,74,44,54,39,26,7,23,5,2,1,4,9,4,12,11,2,1,2,2,2,2,0,31], hi: [3] },
    lex: "<b>Dodson:</b> I, the first-person pronoun.", occ: [] },
  shamayim: { lemma: "שָׁמַיִם", tr: "shamayim", strongs: "H8064", pos: "noun", gloss: "heavens, sky", form: "הַשָּׁמַיִם", ftr: "ha·shamayim", in: "the heavens", morph: "Td + Ncmpa", he: true,
    parse: "Article <b>הַ</b> “the” + noun · masculine · plural · absolute. Hebrew uses the plural for “heavens / sky.”", count: "421 in 395 verses",
    rend: [["heaven(s)", 312], ["air", 43], ["sky", 32], ["skies", 9]], dist: { labels: ["Gen", "Ps", "Mal"], vals: [41,14,1,0,44,4,4,0,4,6,20,16,6,29,2,14,0,23,74,6,5,0,33,33,5,9,5,4,3,2,0,1,0,1,1,2,3,5,1], hi: [0, 4, 18] },
    lex: "<b>BDB (abridged):</b> heavens, sky — the visible heavens where birds fly and clouds move; the abode of God.",
    occ: [["Gen 1:8", "God called the expanse “<mark>sky</mark>.”"], ["Isa 55:9", "“For as the <mark>heavens</mark> are higher than the earth…"]] }
};
WORDS.ampelos = { ...WORDS.ampelo, form: "ἄμπελος", ftr: "ampelos", in: "the vine", morph: "N-NSF", parse: "Noun · feminine · singular · nominative — <b>“the vine”</b> (predicate of εἰμι)." };
WORDS.klemata = { ...WORDS.klema, form: "κλήματα", ftr: "klēmata", in: "the branches", morph: "N-NPN", parse: "Noun · neuter · plural · nominative." };
WORDS.pherei = { ...WORDS.pherein, form: "φέρει", ftr: "pherei", in: "will bear", morph: "V-PAI-3S", parse: "Present · active · indicative · 3rd person singular — <b>“bears.”</b> BSB: “will bear.”" };

const SUPPLIED = {
  v4: { in: "will remain", greek: "κἀγὼ ἐν ὑμῖν", lit: "“and I in you”", note: "The Greek has no verb here. BSB adds “will remain” so the English reads naturally; it echoes μείνατε earlier in the verse." }
};

/* ---------- routing ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const state = { consent: true, platform: "ios", target: "Claude", selected: [], hl: {} };

function show(hash) {
  const [id, sub] = hash.split("/");
  showScreen(id);
  if (sub) setTimeout(() => applyState(sub), 30);
}
/* deep-linkable states, e.g. #read/word-meinate, #read/send, #read/sel-4-5 */
function applyState(sub) {
  const [k, ...rest] = sub.split("-");
  const sel = (...v) => v.forEach(n => toggleVerse(String(n)));
  state.coachDone = 1; const c = $("#coach"); if (c) c.style.display = "none";
  if (k === "sel") sel(...rest);
  if (k === "send") { sel(4, 5); openSend(); }
  if (k === "hl") { sel(5); openSheet("sheet-hl"); $$(".sel-ref-live").forEach(e => e.textContent = refLabel()); }
  if (k === "orig") { sel(5); openSheet("sheet-original"); }
  if (k === "note") { sel(5); openSheet("sheet-note"); }
  if (k === "aa") openSheet("sheet-aa");
  if (k === "pack") { state.pack = false; openWord("meinate", $('.screen.on [data-k="meinate"]')); }
  if (k === "word") { const key = rest.join("-"); openWord(key, $(`.screen.on [data-k="${key}"]`)); }
  if (k === "push") push("Bible CLI", "Claude saved research: “Remain in Me — μένω in John 15.” Tap to review.", "research-detail");
}
function showScreen(id) {
  const scr = document.getElementById(id) || document.getElementById("read");
  closeAll();
  clearSelection();
  $$(".screen").forEach(s => s.classList.toggle("on", s === scr));
  const tab = scr.dataset.tab;
  const tabbar = $(".tabbar");
  tabbar.classList.toggle("hide", !tab);
  $$(".tabbar a").forEach(a => a.classList.toggle("on", a.dataset.tab === tab));
  $$(".side a[href^='#']").forEach(a => a.classList.toggle("on", a.getAttribute("href") === "#" + scr.id));
  const sc = $(".scroll", scr); if (sc && !scr.dataset.keep) sc.scrollTop = 0;
  if (scr.id === "read" && !state.coachDone) $("#coach").style.display = "flex";
  document.body.classList.toggle("no-consent", !state.consent);
}
window.addEventListener("hashchange", () => show(location.hash.slice(1)));
function go(id) { if (location.hash === "#" + id) show(id); else location.hash = id; }

/* ---------- sheets & toasts ---------- */
function openSheet(id) {
  closeMenus();
  $$(".sheet").forEach(s => s.classList.remove("on", "full"));
  $("#backdrop").classList.add("on");
  $("#backdrop").classList.toggle("clear", id === "sheet-word" || id === "sheet-original");
  const s = document.getElementById(id); s.classList.add("on");
  const b = $(".sh-body", s); if (b) b.scrollTop = 0;
}
function closeSheets() { $$(".sheet").forEach(s => s.classList.remove("on")); $("#backdrop").classList.remove("on"); $$(".w.tapped,.ilw.tapped").forEach(w => w.classList.remove("tapped")); }
function closeMenus() { $$(".menu").forEach(m => m.classList.remove("on")); }
function closeAll() { closeSheets(); closeMenus(); }
let toastT;
function toast(msg, action, fn) {
  const t = $("#toast");
  t.innerHTML = `<span>${msg}</span>` + (action ? `<button>${action}</button>` : "");
  if (action) $("button", t).onclick = () => { t.classList.remove("on"); fn && fn(); };
  t.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), 3600);
}
function push(title, body, to) {
  const p = $("#push");
  $(".tx", p).innerHTML = `<b>${title}</b>${body}`;
  p.onclick = () => { p.classList.remove("on"); to && go(to); };
  p.classList.add("on"); setTimeout(() => p.classList.remove("on"), 5200);
}

/* ---------- verse selection ---------- */
function clearSelection() {
  state.selected = [];
  $$(".v.sel").forEach(v => v.classList.remove("sel"));
  const ab = $(".actionbar"); if (ab) ab.classList.add("hide");
  const scr = $(".screen.on"); if (scr && scr.dataset.tab) $(".tabbar").classList.remove("hide");
}
function refLabel() {
  const n = state.selected.map(Number).sort((a, b) => a - b);
  if (!n.length) return "";
  const contiguous = n.every((x, i) => i === 0 || x === n[i - 1] + 1);
  return "John 15:" + (n.length === 1 ? n[0] : contiguous ? `${n[0]}–${n[n.length - 1]}` : n.join(", "));
}
function toggleVerse(num) {
  const v = $(`#read .v[data-v="${num}"]`);
  const i = state.selected.indexOf(num);
  if (i >= 0) { state.selected.splice(i, 1); v.classList.remove("sel"); } else { state.selected.push(num); v.classList.add("sel"); }
  const ab = $(".actionbar");
  if (state.selected.length) {
    ab.classList.remove("hide"); $(".tabbar").classList.add("hide");
    $("#sel-ref").textContent = refLabel();
    $("#sel-n").textContent = state.selected.length === 1 ? "1 verse" : state.selected.length + " verses";
    $$(".sel-ref-live").forEach(e => e.textContent = refLabel());
  } else clearSelection();
}

/* ---------- word sheet ---------- */
function bars(rend) {
  const max = Math.max(...rend.map(r => r[1]), 1);
  return rend.map(([l, n], i) => `<div class="rend${i === 0 ? "" : ""}" onclick="this.parentNode.querySelectorAll('.rend').forEach(r=>r.classList.remove('on'));this.classList.add('on')"><span class="lbl">${l}</span><span class="barw"><b style="width:${n ? Math.max(4, n / max * 100) : 0}%"></b></span><span class="n">${n ? "≈" + n : ""}</span></div>`).join("");
}
function dist(d) {
  const max = Math.max(...d.vals, 1);
  return `<div class="dist">${d.vals.map((v, i) => `<i class="${d.hi.includes(i) ? "hi" : ""}" style="height:${v ? Math.max(4, v / max * 100) : 2}%"></i>`).join("")}</div><div class="dist-lbl">${d.labels.map(l => `<span>${l}</span>`).join("")}</div>`;
}
function openWord(key, el) {
  $$(".w.tapped,.ilw.tapped").forEach(w => w.classList.remove("tapped"));
  if (el) { const grp = el.dataset.g; (grp ? $$(`[data-g="${grp}"]`) : [el]).forEach(w => w.classList.add("tapped")); }
  if (el) { const sc = el.closest(".scroll"); if (sc) { const top = el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop; sc.scrollTop = Math.max(0, top - 90); } }
  if (!state.pack) { openSheet("sheet-pack"); return; }
  if (key.startsWith("sup-")) {
    const s = SUPPLIED[key.slice(4)];
    $("#ws-body").innerHTML = `
      <div class="caps">Added for English sense</div>
      <div class="ws-inverse" style="margin-top:8px">BSB: <q>${s.in}</q></div>
      <p class="lex" style="margin-top:12px">${s.note}</p>
      <div class="ws-sec"><div class="caps">The Greek here</div>
        <div class="ws-head"><span class="ws-lemma" style="font-size:28px">${s.greek}</span><span class="ws-tr">${s.lit}</span></div></div>
      <div class="ws-actions"><button class="btn outline" onclick="go('interlinear')">Open verse interlinear</button></div>`;
    $("#ws-title").textContent = "John 15:4";
    openSheet("sheet-word"); return;
  }
  const w = WORDS[key];
  $("#ws-title").textContent = w.he ? "Genesis 1:1" : el && el.closest("[data-v]") ? "John 15:" + el.closest("[data-v]").dataset.v : "Word";
  $("#ws-body").innerHTML = `
    <div class="ws-head">
      <span class="ws-lemma ${w.he ? "he" : ""}" ${w.he ? 'dir="rtl"' : ""}>${w.form}</span>
      <span class="ws-tr">${w.ftr}</span>
      <span class="ws-strongs">${w.strongs}</span>
    </div>
    <div class="small muted" style="margin-top:4px">Dictionary form <b class="${w.he ? "" : ""}" style="font-family:${w.he ? "var(--hebrew)" : "var(--serif)"};font-size:16px;color:var(--ink)">${w.lemma}</b> · ${w.tr} · ${w.pos} · “${w.gloss}”</div>
    <div class="ws-inverse">In this verse, BSB: <q>${w.in}</q></div>
    <div class="ws-sec"><div class="caps"><span>Parsing</span><span class="mono" style="letter-spacing:0;text-transform:none;font-weight:400">${w.morph}</span></div>
      <div class="parse">${w.parse}</div></div>
    <div class="ws-sec"><div class="caps"><span>BSB translates <span style="text-transform:none;letter-spacing:0;font-family:${w.he ? "var(--hebrew)" : "var(--serif)"};font-size:13px">${w.lemma}</span> as</span><span style="letter-spacing:0;text-transform:none;font-weight:400">tap to filter</span></div>
      <div>${bars(w.rend)}</div>
      <div class="tiny muted" style="margin-top:4px">≈ verse counts from a text match — real counts come from the BSB alignment tables.</div></div>
    <div class="ws-sec"><div class="caps"><span>Where it occurs</span><span style="letter-spacing:0;text-transform:none;font-weight:400">${w.count}</span></div>${dist(w.dist)}</div>
    <div class="ws-sec"><div class="caps">Lexicon</div><div class="lex">${w.lex}</div></div>
    ${w.occ.length ? `<div class="ws-sec"><div class="caps"><span>Occurrences</span><a class="ref" onclick="toast('All occurrences — offline list, filterable by rendering')">All ${w.count.split(" ")[0]} ›</a></div>${w.occ.map(o => `<div class="occ"><span class="ref">${o[0]}</span><span class="t">${o[1]}</span></div>`).join("")}</div>` : ""}
    <div class="ws-actions">
      <button class="btn primary" onclick="openSend('word')"><svg class="i s"><use href="#i-send"/></svg>Send word study</button>
      <button class="btn outline" onclick="closeSheets();toast('Added ${w.lemma} to a new note on ${w.he ? "Gen 1:1" : "John 15"}')"><svg class="i s"><use href="#i-note"/></svg>Add to note</button>
    </div>`;
  openSheet("sheet-word");
}

/* ---------- send ---------- */
function shareText() {
  const q = $("#send-q").value.trim() || "What does “remain” mean here?";
  const r = state.sendKind === "word" ? "μένω (G3306) in John 15:4" : (refLabel() || "John 15:4–5");
  const hl = $("#inc-hl").classList.contains("on");
  return state.sendKind === "word"
    ? `Let's do a word study on μένω (G3306, "remain") in John 15:4 (BSB).\nMy question: ${q}\n[bible-cli share shr_8f3k2m9q1z]\n\nBSB renders it: remain · stay · abide · continue · endure`
    : `Let's study ${r} (BSB).${hl ? ' I highlighted v.5 as "promise".' : ""}\nMy question: ${q}\n[bible-cli share shr_8f3k2m9q1z]\n\n4 Remain in Me, and I will remain in you. Just as no branch can bear fruit by itself unless it remains in the vine, neither can you bear fruit unless you remain in Me.\n5 I am the vine and you are the branches. The one who remains in Me, and I in him, will bear much fruit. For apart from Me you can do nothing.`;
}
function refreshSend() {
  $("#send-preview").textContent = shareText();
  $$("#sheet-send .target[data-t]").forEach(t => t.classList.toggle("on", t.dataset.t === state.target));
  const ios = state.platform === "ios";
  const t = state.target;
  const label = t === "Other" ? "Open share sheet" : t === "Copy" ? "Copy with context" : ios ? `Copy & open ${t}` : `Send to ${t}`;
  $("#send-go").innerHTML = `<svg class="i s"><use href="#i-send"/></svg>${label}`;
  const how = t === "Other" ? "Opens the system share sheet with the text above."
    : t === "Copy" ? "Copies the text above. Paste it anywhere."
    : ios ? `iOS can’t hand text straight to ${t}. We copy it, then open ${t}. Paste to start.`
    : `Android sends the text straight into ${t} (if installed).`;
  $("#send-how").textContent = how;
  $$("#sheet-send .platform button").forEach(b => b.classList.toggle("on", b.dataset.p === state.platform));
  $("#send-title").textContent = state.sendKind === "word" ? "Send word study" : "Send " + (refLabel() || "John 15:4–5");
}
function openSend(kind) { state.sendKind = kind || "verses"; openSheet("sheet-send"); refreshSend(); }
function doSend() {
  const t = state.target, ios = state.platform === "ios";
  closeSheets(); clearSelection();
  if (t === "Copy") return toast("Copied with context · also in your inbox");
  if (t === "Other") return toast("Share sheet opened · also in your inbox");
  toast(ios ? `Copied · opening ${t}… Paste to start. It’s in your inbox too.` : `Sent to ${t} · also in your inbox`);
  if (t === "Claude") setTimeout(() => push("Bible CLI", "Claude saved research: “Remain in Me — μένω in John 15.” Tap to review.", "research-detail"), 4200);
}

/* ---------- misc interactions ---------- */
function hl(color, name) {
  const sel = state.selected.slice();
  sel.forEach(n => { const v = $(`#read .v[data-v="${n}"]`); v.className = v.className.replace(/hl-\w+/g, ""); v.classList.add("hl-" + color); });
  closeSheets(); const lbl = refLabel(); clearSelection();
  toast(`Highlighted ${lbl} as “${name}”`, "Undo", () => sel.forEach(n => $(`#read .v[data-v="${n}"]`).classList.remove("hl-" + color)));
}
function setMode(el) {
  $$(".mode", el.parentNode).forEach(m => m.classList.remove("on")); el.classList.add("on");
  const m = el.dataset.m, note = $("#mode-note", el.closest(".screen"));
  if (note) note.innerHTML = m === "read" ? "Claude’s save tools disappear on its next call. Reads still work." : m === "approve" ? "New saves from Claude wait in <b>Needs approval</b> until you decide." : "Saves land right away, labeled “Saved by Claude.” Undo for 30 days.";
  $$(".mode-dep", el.closest(".screen")).forEach(d => d.style.opacity = m === "read" ? .4 : 1);
}
function undoFeed(btn) {
  const it = btn.closest(".feed-item");
  if (it.classList.toggle("undone")) { btn.textContent = "Restore"; toast("Undone · restorable for 30 days"); }
  else { btn.textContent = "Undo"; toast("Restored"); }
}
function decide(btn, verb) {
  const card = btn.closest(".pending");
  card.style.transition = "opacity .2s, transform .2s"; card.style.opacity = 0; card.style.transform = "translateX(" + (verb === "Rejected" ? "-" : "") + "40px)";
  setTimeout(() => { card.style.display = "none"; const n = $$("#approvals .pending").filter(c => c.style.display !== "none").length; $$(".pend-count").forEach(e => e.textContent = n); if (!n) $("#appr-empty").style.display = "block"; }, 200);
  toast(verb === "Rejected" ? "Rejected · the agent is told it wasn’t saved" : "Approved · saved to your Journal", "Undo", () => { card.style.display = ""; card.style.opacity = 1; card.style.transform = "none"; });
}
function consent(yes) { state.consent = yes; go("onb-signin"); }
function toggleEye(btn) {
  const off = btn.classList.toggle("off");
  btn.innerHTML = `<svg class="i s"><use href="#i-${off ? "eye-off" : "eye"}"/></svg>`;
  toast(off ? "Hidden from agents" : "Visible to agents");
}

document.addEventListener("click", e => {
  const t = e.target.closest(".toggle"); if (t && !t.dataset.static) t.classList.toggle("on");
  const c = e.target.closest(".check"); if (c && c.closest("label")) { c.classList.toggle("on"); if (c.closest("#sheet-send")) refreshSend(); }
  const ch = e.target.closest(".chips.single .chip"); if (ch) { $$(".chip", ch.parentNode).forEach(x => x.classList.remove("on")); ch.classList.add("on"); }
  if (!e.target.closest(".menu") && !e.target.closest("[data-menu]")) closeMenus();
});

/* long-press a verse to select it; tap a word to study it */
(function () {
  let timer, moved = false, fired = false;
  document.addEventListener("pointerdown", e => {
    const v = e.target.closest("#read .v"); if (!v) return;
    moved = false; fired = false;
    timer = setTimeout(() => { fired = true; toggleVerse(v.dataset.v); if (navigator.vibrate) navigator.vibrate(8); }, 450);
  });
  document.addEventListener("pointermove", () => { moved = true; clearTimeout(timer); });
  document.addEventListener("pointerup", e => {
    clearTimeout(timer);
    if (fired || moved) return;
    const vn = e.target.closest("#read .vn"); if (vn) { toggleVerse(vn.closest(".v").dataset.v); return; }
    if (state.selected.length && e.target.closest("#read .v")) { toggleVerse(e.target.closest(".v").dataset.v); return; }
    const w = e.target.closest(".w[data-k], .ilw[data-k]"); if (w) openWord(w.dataset.k, w);
  });
  document.addEventListener("contextmenu", e => { if (e.target.closest("#read .v")) e.preventDefault(); });
})();

window.addEventListener("DOMContentLoaded", () => {
  state.pack = true;
  show(location.hash.slice(1) || "read");
});
