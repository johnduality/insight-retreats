// Insight Retreats — front-end app (vanilla JS, no build step).
// Loads catalogue data, renders list + Leaflet map + detail views.

const state = {
  centers: [],
  tags: null,
  tagIndex: new Map(), // tagId -> { label, color }
  filters: { search: "", stateCode: "", tags: new Set(), exclude: new Set() },
  view: "map",
  map: null,
  markers: null,
};

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, props = {}, ...kids) => {
  const node = Object.assign(document.createElement(tag), props);
  for (const k of kids) node.append(k?.nodeType ? k : document.createTextNode(k ?? ""));
  return node;
};

// Full names for the state codes used in entries (extend as the catalogue grows).
const STATE_NAMES = { CA: "California", OR: "Oregon", WA: "Washington", NY: "New York", MA: "Massachusetts", CO: "Colorado", TX: "Texas", IL: "Illinois", NM: "New Mexico", NC: "North Carolina", FL: "Florida", GA: "Georgia", VA: "Virginia", PA: "Pennsylvania", WI: "Wisconsin", MS: "Mississippi", AZ: "Arizona", MD: "Maryland", MI: "Michigan", VT: "Vermont", HI: "Hawaii", MT: "Montana", MN: "Minnesota", TN: "Tennessee", ME: "Maine", NJ: "New Jersey", CT: "Connecticut", WV: "West Virginia", KY: "Kentucky", NH: "New Hampshire", IA: "Iowa", MO: "Missouri", IN: "Indiana", ID: "Idaho", RI: "Rhode Island", DE: "Delaware", KS: "Kansas", NE: "Nebraska", AR: "Arkansas", LA: "Louisiana", SC: "South Carolina" };

// ---------- Boot ----------
init();

async function init() {
  // Prefer the generated globals (works when opened directly as a file); fall
  // back to fetch for setups that serve the JSON.
  let centers = window.__CENTERS__;
  let tags = window.__TAGS__;
  if (!centers || !tags) {
    [centers, tags] = await Promise.all([
      fetch("./data/centers.json").then((r) => r.json()),
      fetch("./data/tags.json").then((r) => r.json()),
    ]);
  }
  state.centers = centers;
  state.tags = tags;
  for (const g of tags.groups) for (const t of g.tags) state.tagIndex.set(t.id, { ...t, color: g.color });

  buildStateFilter();
  buildTagFilters();
  wireControls();
  window.addEventListener("hashchange", route);
  setView(state.view);
  route();
}

// ---------- Controls ----------
function buildStateFilter() {
  const sel = $("#stateFilter");
  const codes = [...new Set(state.centers.map((c) => c.location.state).filter(Boolean))].sort();
  for (const code of codes) sel.append(el("option", { value: code, textContent: STATE_NAMES[code] || code }));
}

function buildTagFilters() {
  const box = $("#tagFilters");
  box.innerHTML = "";
  // Only show tags that at least one center actually uses, to keep it tidy.
  const used = new Set(state.centers.flatMap((c) => c.tags || []));
  for (const g of state.tags.groups) {
    for (const t of g.tags) {
      if (!used.has(t.id)) continue;
      const chip = el("button", { className: "chip", type: "button", textContent: t.label });
      chip.dataset.tag = t.id;
      chip.title = "Click to require this tag · double-click to exclude it";
      const sync = () => {
        chip.classList.toggle("is-active", state.filters.tags.has(t.id));
        chip.classList.toggle("is-excluded", state.filters.exclude.has(t.id));
      };
      chip.addEventListener("click", () => {
        const inc = state.filters.tags, exc = state.filters.exclude;
        if (exc.has(t.id)) exc.delete(t.id);        // excluded -> neutral
        else if (inc.has(t.id)) inc.delete(t.id);   // included -> neutral
        else inc.add(t.id);                         // neutral  -> included
        sync();
        renderCatalogue();
      });
      chip.addEventListener("dblclick", () => {
        const inc = state.filters.tags, exc = state.filters.exclude;
        inc.delete(t.id);
        exc.add(t.id);                              // -> excluded (red)
        sync();
        renderCatalogue();
      });
      box.append(chip);
    }
  }
}

function wireControls() {
  $("#search").addEventListener("input", (e) => {
    state.filters.search = e.target.value.toLowerCase().trim();
    renderCatalogue();
  });
  $("#stateFilter").addEventListener("change", (e) => {
    state.filters.stateCode = e.target.value;
    renderCatalogue();
  });
  $("#tabList").addEventListener("click", () => setView("list"));
  $("#tabMap").addEventListener("click", () => setView("map"));
}

function setView(view) {
  state.view = view;
  $("#tabList").classList.toggle("is-active", view === "list");
  $("#tabMap").classList.toggle("is-active", view === "map");
  $("#listView").classList.toggle("is-hidden", view !== "list");
  $("#mapView").classList.toggle("is-hidden", view !== "map");
  if (view === "map") ensureMap();
  renderCatalogue();
}

// ---------- Filtering ----------
function filtered() {
  const { search, stateCode, tags, exclude } = state.filters;
  return state.centers.filter((c) => {
    if (stateCode && c.location.state !== stateCode) return false;
    if (tags.size && ![...tags].every((t) => (c.tags || []).includes(t))) return false;
    if (exclude.size && (c.tags || []).some((t) => exclude.has(t))) return false;
    if (search) {
      const hay = [c.name, c.tradition, c.location.city, c.location.county, c.about]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });
}

// ---------- Catalogue render ----------
function renderCatalogue() {
  const items = filtered();
  const codes = [...new Set(state.centers.map((c) => c.location.state).filter(Boolean))];
  const scope = state.filters.stateCode
    ? STATE_NAMES[state.filters.stateCode] || state.filters.stateCode
    : codes.length === 1 ? STATE_NAMES[codes[0]] || codes[0] : "the U.S.";
  $("#resultCount").textContent = `${items.length} center${items.length === 1 ? "" : "s"} in ${scope}`;
  const supportedEl = $("#supportedStates");
  if (supportedEl) {
    const allCodes = [...Object.keys(STATE_NAMES), "NV", "OH", "UT", "SD", "ND", "AK", "WY", "OK", "AL", "DC"].sort();
    supportedEl.textContent = `Supported states: ${allCodes.join(", ")}`;
  }
  if (state.view === "list") renderCards(items);
  else renderMarkers(items);
}

function renderCards(items) {
  const box = $("#cards");
  box.innerHTML = "";
  if (!items.length) {
    box.append(el("p", { className: "empty", textContent: "No centers match those filters yet." }));
    return;
  }
  for (const c of items) {
    const card = el("article", { className: "card" });
    card.append(
      el("h3", { textContent: c.name }),
      el("p", { className: "tradition", textContent: c.tradition }),
      el("p", { className: "place", textContent: `${c.location.city}, ${c.location.county || c.location.state}` }),
      el("p", { className: "about", textContent: truncate(c.about, 160) })
    );
    card.append(cardPrice(c.pricePerDay));
    const tagrow = el("div", { className: "tagrow" });
    for (const t of (c.tags || []).slice(0, 4)) {
      const info = state.tagIndex.get(t);
      if (info) tagrow.append(el("span", { className: "minitag", textContent: info.label }));
    }
    card.append(tagrow);    card.addEventListener("click", () => (location.hash = `#/center/${c.id}`));
    box.append(card);
  }
}

// ---------- Map ----------
function ensureMap() {
  if (state.map) return;
  state.map = L.map("map", { scrollWheelZoom: false }).setView([37.3, -119.5], 6);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 18,
  }).addTo(state.map);
  state.markers = L.layerGroup().addTo(state.map);
}

function renderMarkers(items) {
  if (!state.map) return;
  state.markers.clearLayers();
  const bounds = [];
  for (const c of items) {
    const { lat, lng } = c.location;
    if (typeof lat !== "number" || typeof lng !== "number") continue;
    bounds.push([lat, lng]);
    const m = L.marker([lat, lng]).bindPopup(
      `<div class="map-popup"><h4>${escapeHtml(c.name)}</h4>` +
        `<p>${escapeHtml(c.tradition)}<br>${escapeHtml(c.location.city)}, ${escapeHtml(c.location.county || c.location.state)}</p>` +
        `<a href="#/center/${c.id}">View entry →</a></div>`
    );
    state.markers.addLayer(m);
  }
  if (bounds.length) state.map.fitBounds(bounds, { padding: [40, 40], maxZoom: 10 });
  setTimeout(() => state.map.invalidateSize(), 50);
}

// ---------- Routing ----------
function route() {
  if (location.hash === "#/about") return showAbout();
  const m = location.hash.match(/^#\/center\/(.+)$/);
  if (m) {
    const center = state.centers.find((c) => c.id === decodeURIComponent(m[1]));
    if (center) return showDetail(center);
  }
  showCatalogue();
}

function showCatalogue() {
  $("#detail").classList.add("is-hidden");
  $("#about")?.classList.add("is-hidden");
  $("#catalogue").classList.remove("is-hidden");
  $("#intro")?.classList.remove("is-hidden");
  window.scrollTo(0, 0);
  renderCatalogue();
}

function showAbout() {
  $("#catalogue").classList.add("is-hidden");
  $("#detail").classList.add("is-hidden");
  $("#intro")?.classList.add("is-hidden");
  $("#about").classList.remove("is-hidden");
  window.scrollTo(0, 0);
}

function showDetail(c) {
  $("#catalogue").classList.add("is-hidden");
  $("#about")?.classList.add("is-hidden");
  $("#intro")?.classList.add("is-hidden");
  const box = $("#detail");
  box.classList.remove("is-hidden");
  window.scrollTo(0, 0);
  box.innerHTML = "";

  const back = el("button", { className: "detail-back", type: "button", textContent: "← Back to catalogue" });
  back.addEventListener("click", () => (location.hash = "#/"));

  const head = el("div", { className: "detail-head" });
  head.append(
    el("h1", { textContent: c.name }),
    el("p", { className: "tradition", textContent: c.tradition }),
    el("p", { className: "place", textContent: [c.location.address, `${c.location.city}, ${c.location.state}`].filter(Boolean).join(" · ") })
  );

  const main = el("div", { className: "detail-main" });
  const rows = [];
  if (c.technique) rows.push(["Practice", c.technique]);
  if (c.influences?.length) rows.push(["Influences", c.influences.join(", ")]);
  if (c.teacherAccess) rows.push(["Teacher access", c.teacherAccess]);
  if (c.retreatOptions) rows.push(["Retreat options", c.retreatOptions]);
  if (c.schedule) rows.push(["Schedule", c.schedule]);
  if (c.cost) rows.push(["Cost", c.cost]);
  if (rows.length) {
    const dl2 = el("dl", { className: "inline-facts" });
    for (const [k, v] of rows) { dl2.append(el("dt", { textContent: k }), el("dd", { textContent: v })); }
    main.append(dl2);
  }
  main.append(el("h2", { textContent: "About" }), el("p", { textContent: c.about }));

  // Tags
  main.append(el("h2", { textContent: "Tags" }));
  const tagWrap = el("div", { className: "detail-tags" });
  for (const t of c.tags || []) {
    const info = state.tagIndex.get(t);
    if (info) tagWrap.append(el("span", { className: "taglabel", textContent: info.label, style: `background:${info.color}` }));
  }
  main.append(tagWrap);

  // Sources
  if (c.sources?.length) {
    main.append(el("h2", { textContent: "Sources" }));
    const ul = el("ul", { className: "sources" });
    for (const s of c.sources) {
      const a = el("a", { href: s.url, target: "_blank", rel: "noopener", textContent: s.title || s.url });
      ul.append(el("li", {}, a));
    }
    main.append(ul);
  }

  // Fact sidebar
  const facts = el("aside", { className: "facts" });
  const pp = pricePerDayParts(c.pricePerDay);
  if (pp) {
    const pb = el("div", { className: "facts-price" });
    pb.append(el("span", { className: "facts-price-amount", textContent: pp.amount }));
    pb.append(el("span", { className: "facts-price-unit", textContent: pp.unit }));
    if (c.pricePerDay && c.pricePerDay.source)
      pb.append(el("a", { className: "facts-price-src", href: c.pricePerDay.source, target: "_blank", rel: "noopener", textContent: "source ↗" }));
    facts.append(pb);
  }
  const dl = el("dl");
  const fact = (label, valueNode) => {
    dl.append(el("dt", { className: "fact-label", textContent: label }));
    dl.append(el("dd", { className: "fact-value" }, valueNode));
  };
  fact("Food served", foodFact(c));
  fact("Work required", badge(c.workRequired, c.workNotes));
  fact("Region", document.createTextNode(c.location.region || "—"));
  if (c.website) {
    const host = c.website.replace(/^https?:\/\//, "").replace(/\/$/, "");
    fact("Website", el("a", { href: c.website, target: "_blank", rel: "noopener", textContent: host }));
  }
  const dir = el("a", {
    href: `https://www.openstreetmap.org/?mlat=${c.location.lat}&mlon=${c.location.lng}#map=13/${c.location.lat}/${c.location.lng}`,
    target: "_blank",
    rel: "noopener",
    textContent: "Open in map ↗",
  });
  fact("Location", dir);
  if (c.meta?.lastUpdated) fact("Last updated", document.createTextNode(formatDate(c.meta.lastUpdated)));
  facts.append(dl);

  const grid = el("div", { className: "detail-grid" }, main, facts);
  box.append(back, head, grid);
}

function badge(value, notes) {
  const v = value || "unknown";
  const span = el("span", { className: `badge ${v}`, textContent: v });
  if (notes) {
    const wrap = el("span", {}, span, el("p", { className: "fact-value", textContent: notes, style: "margin-top:6px" }));
    return wrap;
  }
  return span;
}

function foodFact(c) {
  const v = c.foodServed || "unknown";
  const top = el("span", { className: "food-badges" });
  top.append(el("span", { className: `badge ${v}`, textContent: v }));
  if (c.foodType && c.foodType !== "unknown")
    top.append(el("span", { className: "badge diet", textContent: cap(c.foodType), style: "margin-left:6px" }));
  if (c.foodNotes)
    return el("span", {}, top, el("p", { className: "fact-value", textContent: c.foodNotes, style: "margin-top:6px" }));
  return top;
}

// ---------- helpers ----------
function truncate(s = "", n) { return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s; }
function escapeHtml(s = "") { return s.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])); }
function formatDate(iso) { try { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso); const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(iso); return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); } catch { return ""; } }
function cap(s = "") { return s.charAt(0).toUpperCase() + s.slice(1); }

// ---------- cost helpers ----------
function cardPrice(p) {
  const wrap = el("p", { className: "card-price" });
  const money = (n) => "$" + Math.round(n).toLocaleString();
  const unit = (p && p.unit) || "night";
  let amount = "~$?", showUnit = true;
  if (p && (p.min != null || p.max != null)) {
    let a = p.min != null && p.max != null
      ? (p.min === p.max ? money(p.min) : (p.min === 0 ? "Free" : money(p.min)) + "–" + money(p.max))
      : money(p.min != null ? p.min : p.max);
    if (a.startsWith("$")) a = "~" + a;
    amount = a;
    if (a === "Free") showUnit = false;
  } else if (p && p.min == null && p.max == null) {
    amount = "Donation-based"; showUnit = false;
  }
  wrap.append(el("span", { className: "card-price-amount", textContent: amount }));
  if (showUnit) wrap.append(el("span", { className: "card-price-unit", textContent: " / " + unit }));
  return wrap;
}
function formatPricePerDay(p) {
  if (!p) return "~$? / night";
  const unit = p.unit || "night";
  const money = (n) => "$" + Math.round(n).toLocaleString();
  if (p.min == null && p.max == null) return "Donation-based";
  let amount;
  if (p.min != null && p.max != null) amount = p.min === p.max ? money(p.min) : (p.min === 0 ? "Free" : money(p.min)) + "–" + money(p.max);
  else amount = money(p.min != null ? p.min : p.max);
  return (amount.startsWith("$") ? "~" : "") + amount + " / " + unit;
}
function costCallout(c) {
  const box = el("div", { className: "cost-callout" });
  box.append(el("span", { className: "cost-label", textContent: "Cost" }));
  const price = formatPricePerDay(c.pricePerDay);
  if (price) box.append(el("span", { className: "cost-amount", textContent: price }));
  if (c.cost) box.append(el("span", { className: "cost-note", textContent: c.cost }));
  return box;
}
function pricePerDayParts(p) {
  if (!p) return { amount: "~$?", unit: "per night" };
  const unit = p.unit || "night";
  const money = (n) => "$" + Math.round(n).toLocaleString();
  if (p.min == null && p.max == null) return { amount: "Donation", unit: "by donation" };
  let amount;
  if (p.min != null && p.max != null) amount = p.min === p.max ? money(p.min) : (p.min === 0 ? "Free" : money(p.min)) + "–" + money(p.max);
  else amount = money(p.min != null ? p.min : p.max);
  if (amount.startsWith("$")) amount = "~" + amount;
  return { amount, unit: "per " + unit };
}
