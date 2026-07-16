
process.on('unhandledRejection', () => {});
process.on('uncaughtException', (e) => console.error('UNCAUGHT:', e));
import('jsdom').then(async ({ JSDOM }) => {
  const { readFileSync } = await import('node:fs');
  const root = '/sessions/loving-brave-newton/mnt/Insight Retreats';
  const centerId = process.argv[2];
  const html = readFileSync(`${root}/public/index.html`, 'utf8');
  const dataJs = readFileSync(`${root}/public/data/data.js`, 'utf8');
  const appJs = readFileSync(`${root}/public/app.js`, 'utf8');

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: `file://${root}/public/index.html#/center/${centerId}`,
    pretendToBeVisual: true,
    beforeParse(window) {
      window.scrollTo = () => {};
      const chainable = () => new Proxy({}, { get: () => () => chainable() });
      window.L = new Proxy({}, { get: () => () => chainable() });
      window.XLSX = { utils: { json_to_sheet: () => ({}), book_new: () => ({}), book_append_sheet: () => {} }, writeFile: () => {} };
      const errors = [];
      window.addEventListener('error', (e) => errors.push(e.error?.stack || e.message));
      window.__errors = errors;
    },
  });

  const { window } = dom;
  const s1 = window.document.createElement('script');
  s1.textContent = dataJs;
  window.document.body.appendChild(s1);
  const s2 = window.document.createElement('script');
  s2.textContent = appJs;
  window.document.body.appendChild(s2);

  await new Promise((r) => setTimeout(r, 200));
  try { window.location.hash = `#/center/${centerId}`; } catch (e) {}
  await new Promise((r) => setTimeout(r, 200));

  const errors = window.__errors || [];
  const detailEl = window.document.querySelector('#detail') || window.document.body;
  const centerName = window.__CENTERS__?.find((c) => c.id === centerId)?.name || '___NOPE___';
  const hasName = detailEl.textContent.includes(centerName);

  console.log('centerId:', centerId);
  console.log('JS errors:', errors.length ? errors : 'none');
  console.log('detail text includes center name:', hasName, `(${centerName})`);
  process.exit(0);
});
