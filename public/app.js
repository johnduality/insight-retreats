// Insight Retreats — front-end app (vanilla JS, no build step).
// Loads catalogue data, renders list + Leaflet map + detail views.

const state = {
  centers: [],
  tags: null,
  tagIndex: new Map(), // tagId -> { label, color }
  filters: { search: "", region: "", stateCode: "", tags: new Set(), exclude: new Set(), priceMin: null, priceMax: null },
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
const STATE_NAMES = { CA: "California", OR: "Oregon", WA: "Washington", NY: "New York", MA: "Massachusetts", CO: "Colorado", TX: "Texas", IL: "Illinois", NM: "New Mexico", NC: "North Carolina", FL: "Florida", GA: "Georgia", VA: "Virginia", PA: "Pennsylvania", WI: "Wisconsin", MS: "Mississippi", AZ: "Arizona", MD: "Maryland", MI: "Michigan", VT: "Vermont", HI: "Hawaii", MT: "Montana", MN: "Minnesota", TN: "Tennessee", ME: "Maine", NJ: "New Jersey", CT: "Connecticut", WV: "West Virginia", KY: "Kentucky", NH: "New Hampshire", IA: "Iowa", MO: "Missouri", IN: "Indiana", ID: "Idaho", RI: "Rhode Island", DE: "Delaware", KS: "Kansas", NE: "Nebraska", AR: "Arkansas", LA: "Louisiana", SC: "South Carolina",
  // Canadian provinces/territories (distinct codes from the US list above -- do NOT reuse "CA" for Canada, it collides with California)
  BC: "British Columbia", ON: "Ontario", QC: "Quebec", AB: "Alberta", MB: "Manitoba", NB: "New Brunswick", NS: "Nova Scotia", SK: "Saskatchewan", NL: "Newfoundland and Labrador", PE: "Prince Edward Island", YT: "Yukon", NT: "Northwest Territories", NU: "Nunavut" };

// ---------- Regions ----------
// Preferred display order for the region selector; anything else falls to the end.
const REGION_ORDER = ["United States", "Canada", "Europe", "Latin America", "Oceania"];
const EUROPE = new Set(["United Kingdom", "Germany", "France", "Spain", "Italy", "Netherlands", "Switzerland", "Ireland", "Austria", "Belgium", "Portugal", "Poland", "Sweden", "Denmark", "Norway", "Finland", "Czech Republic", "Greece", "Hungary", "Romania", "Slovenia", "Croatia", "Bulgaria", "Iceland"]);
const LATIN_AMERICA = new Set(["Mexico", "Guatemala", "Costa Rica", "Panama", "Colombia", "Ecuador", "Peru", "Chile", "Argentina", "Brazil", "Uruguay"]);
const OCEANIA = new Set(["Australia", "New Zealand"]);
// Which top-level region a center belongs to. US entries carry no `country`.
function regionOf(c) {
  const country = c.location.country;
  if (!country || country === "United States" || country === "USA") return "United States";
  if (country === "Canada") return "Canada";
  if (EUROPE.has(country)) return "Europe";
  if (LATIN_AMERICA.has(country)) return "Latin America";
  if (OCEANIA.has(country)) return "Oceania";
  return country; // fallback: its own bucket until it's slotted above
}
// Currency symbol for a pricePerDay.currency code (defaults to the code itself,
// e.g. "CHF 80", rather than silently mislabeling an unmapped currency as "$").
function currencySymbol(cur) {
  const map = {
    USD: "$", CAD: "$", AUD: "$", EUR: "€", GBP: "£", CHF: "CHF ",
    ISK: "kr ", SEK: "kr ", DKK: "kr ", NOK: "kr ", CZK: "Kč ", PLN: "zł ",
    HUF: "Ft ", RON: "lei ", BGN: "лв ",
  };
  return map[cur] || (cur ? cur + " " : "$");
}

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

  buildRegionFilter();
  buildStateFilter();
  buildTagFilters();
  wireControls();
  window.addEventListener("hashchange", route);
  setView(state.view);
  route();
}

// ---------- Controls ----------
// Region selector: only regions that actually have centers, in preferred order.
function buildRegionFilter() {
  const sel = $("#regionFilter");
  if (!sel) return;
  const present = [...new Set(state.centers.map(regionOf))];
  present.sort((a, b) => {
    const ia = REGION_ORDER.indexOf(a), ib = REGION_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
  sel.innerHTML = "";
  sel.append(el("option", { value: "", textContent: "All regions" }));
  for (const r of present) sel.append(el("option", { value: r, textContent: r }));
}

// Place selector, scoped to the chosen region. US centers list by state; others by
// country. Option values match either location.state or location.country.
function buildStateFilter() {
  const sel = $("#stateFilter");
  const region = state.filters.region;
  const places = new Map(); // value -> label
  // US and Canada both list by state/province code; every other region lists by country.
  const byStateCode = region === "United States" || region === "Canada";
  for (const c of state.centers) {
    if (region && regionOf(c) !== region) continue;
    if (byStateCode) {
      const code = c.location.state;
      if (code) places.set(code, STATE_NAMES[code] || code);
    } else if (c.location.country) {
      places.set(c.location.country, c.location.country);
    }
  }
  const sorted = [...places.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const allLabel =
    region === "United States" ? "All states" :
    region === "Canada" ? "All provinces" :
    region ? "All countries" : "All subregions";
  sel.innerHTML = "";
  sel.append(el("option", { value: "", textContent: allLabel }));
  for (const [value, label] of sorted) sel.append(el("option", { value, textContent: label }));
}

// Label for a selected place value (state code or country name).
function placeLabel(v) { return STATE_NAMES[v] || v; }

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
  $("#regionFilter")?.addEventListener("change", (e) => {
    state.filters.region = e.target.value;
    state.filters.stateCode = "";   // reset the place filter when region changes
    buildStateFilter();             // repopulate places for the chosen region
    renderCatalogue();
  });
  $("#stateFilter").addEventListener("change", (e) => {
    state.filters.stateCode = e.target.value;
    renderCatalogue();
  });
  $("#tabList").addEventListener("click", () => setView("list"));
  $("#tabMap").addEventListener("click", () => setView("map"));

  // Min/max price-per-night filter. Blank inputs mean "no bound".
  const readPrice = (sel) => {
    const v = parseFloat($(sel).value);
    return Number.isFinite(v) && v >= 0 ? v : null;
  };
  const onPrice = () => {
    state.filters.priceMin = readPrice("#priceMin");
    state.filters.priceMax = readPrice("#priceMax");
    renderCatalogue();
  };
  $("#priceMin")?.addEventListener("input", onPrice);
  $("#priceMax")?.addEventListener("input", onPrice);
  $("#priceClear")?.addEventListener("click", () => {
    $("#priceMin").value = "";
    $("#priceMax").value = "";
    onPrice();
  });
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
  const { search, region, stateCode, tags, exclude } = state.filters;
  return state.centers.filter((c) => {
    if (region && regionOf(c) !== region) return false;
    if (stateCode && c.location.state !== stateCode && c.location.country !== stateCode) return false;
    const { priceMin, priceMax } = state.filters;
    if ((priceMin != null || priceMax != null) && !priceInRange(c, priceMin, priceMax)) return false;
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
  const scope = state.filters.stateCode
    ? placeLabel(state.filters.stateCode)
    : state.filters.region || "all regions";
  $("#resultCount").textContent = `${items.length} center${items.length === 1 ? "" : "s"} in ${scope}`;
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
// True when a center's listed nightly price overlaps the [min, max] window (a null
// bound means "no limit" on that side, using the center's own min/max). Donation-based
// and price-unknown centers do not qualify.
function priceInRange(c, min, max) {
  const p = c.pricePerDay;
  if (!p) return false;
  const lo = p.min != null ? p.min : (p.max != null ? p.max : null);
  const hi = p.max != null ? p.max : (p.min != null ? p.min : null);
  if (lo == null || hi == null) return false;
  if (min != null && hi < min) return false; // priciest option still below the min
  if (max != null && lo > max) return false; // cheapest option still above the max
  return true;
}
function cardPrice(p) {
  const wrap = el("p", { className: "card-price" });
  const sym = currencySymbol(p && p.currency);
  const money = (n) => sym + Math.round(n).toLocaleString();
  const unit = (p && p.unit) || "night";
  let amount = "Price unknown", showUnit = false;
  if (p && (p.min != null || p.max != null)) {
    let a = p.min != null && p.max != null
      ? (p.min === p.max ? money(p.min) : (p.min === 0 ? "Free" : money(p.min)) + "–" + money(p.max))
      : money(p.min != null ? p.min : p.max);
    if (a.startsWith(sym)) a = "~" + a;
    amount = a;
    showUnit = a !== "Free";
  } else if (p && p.min == null && p.max == null) {
    amount = "Donation-based"; showUnit = false;
  }
  wrap.append(el("span", { className: "card-price-amount", textContent: amount }));
  if (showUnit) wrap.append(el("span", { className: "card-price-unit", textContent: " / " + unit }));
  return wrap;
}
function formatPricePerDay(p) {
  if (!p) return "Price unknown";
  const sym = currencySymbol(p.currency);
  const unit = p.unit || "night";
  const money = (n) => sym + Math.round(n).toLocaleString();
  if (p.min == null && p.max == null) return "Donation-based";
  let amount;
  if (p.min != null && p.max != null) amount = p.min === p.max ? money(p.min) : (p.min === 0 ? "Free" : money(p.min)) + "–" + money(p.max);
  else amount = money(p.min != null ? p.min : p.max);
  return (amount.startsWith(sym) ? "~" : "") + amount + " / " + unit;
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
  if (!p) return { amount: "Price unknown", unit: "" };
  const sym = currencySymbol(p.currency);
  const unit = p.unit || "night";
  const money = (n) => sym + Math.round(n).toLocaleString();
  if (p.min == null && p.max == null) return { amount: "Donation", unit: "by donation" };
  let amount;
  if (p.min != null && p.max != null) amount = p.min === p.max ? money(p.min) : (p.min === 0 ? "Free" : money(p.min)) + "–" + money(p.max);
  else amount = money(p.min != null ? p.min : p.max);
  if (amount.startsWith(sym)) amount = "~" + amount;
  return { amount, unit: "per " + unit };
}
