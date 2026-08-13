// enrich_fundamentals.js
// 自动补全 fundamentals.json 中缺失的分红/行情数据：
//   - 每股分红(TTM)、连续分红年数、行业性质 ← 东方财富 emweb F10 分红融资（服务端 Node，无 CORS 限制）
//   - 现价、总市值、名称 ← 东方财富 push2 实时行情
// 仅对 div==0 / 缺 years / 缺现价市值 的股票补全，不会覆盖已有正确值。
//
// 用法：
//   node enrich_fundamentals.js          本地运行：补全后通过 GitHub API push（需 .gh_token）
//   node enrich_fundamentals.js --no-push 仅更新本地文件不 push（供 auto_update.js / Actions 调用）
//
// 退出前写入 .enrich_status = "changed" | "none"，供调用方判断是否需要推送。

const fs = require('fs');
const path = require('path');

const REPO = 'xlsh2026/bank-stock-data';
const NO_PUSH = process.argv.includes('--no-push');
const IS_ACTIONS = !!process.env.GITHUB_ACTIONS;

let TOKEN = null;
try { TOKEN = fs.readFileSync(path.join(__dirname, '.gh_token'), 'utf8').trim(); } catch (e) {}
const HEADERS = TOKEN
  ? { Authorization: 'Bearer ' + TOKEN, Accept: 'application/vnd.github+json', 'User-Agent': 'wb-autobackup', 'Content-Type': 'application/json' }
  : {};

function getJSON(url, hd) {
  return fetch(url, { headers: Object.assign({ 'User-Agent': 'Mozilla/5.0' }, hd || {}) }).then(r => {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  });
}
function emwebCode(code) {
  const c = code.replace(/^(sh|sz)/, '');
  return (/^[69]/.test(c) ? 'SH' : 'SZ') + c;
}
function push2Secid(code) {
  const c = code.replace(/^(sh|sz)/, '');
  return (/^[69]/.test(c) ? '1.' : '0.') + c;
}
// "10派3.2元" -> 0.32；"不分配" -> 0
function parseCash(profile) {
  if (!profile || /不分配|不转增/.test(profile)) return 0;
  const m = profile.match(/10派([\d.]+)元/);
  return m ? parseFloat(m[1]) / 10 : 0;
}

async function fetchBonus(code) {
  const url = 'https://emweb.securities.eastmoney.com/PC_HSF10/BonusFinancing/PageAjax?code=' + emwebCode(code);
  const j = await getJSON(url, { Referer: 'https://emweb.securities.eastmoney.com/' });
  const arr = j.fhyx || [];
  const now = Date.now();
  const YEAR = 365 * 24 * 3600 * 1000;
  let ttmCash = 0;
  const implYears = new Set();
  for (const d of arr) {
    if (d.ASSIGN_PROGRESS !== '实施方案') continue;
    const cash = parseCash(d.IMPL_PLAN_PROFILE);
    if (cash <= 0) continue;
    const ex = d.EX_DIVIDEND_DATE || '';
    const exT = ex ? new Date(ex.replace(' ', 'T')).getTime() : 0;
    if (exT && now - exT <= YEAR) ttmCash += cash; // TTM：最近 12 个月内实施的现金分红求和
    const yr = ex.slice(0, 4) || (d.NOTICE_DATE || '').slice(0, 4);
    if (yr) implYears.add(yr);
  }
  return { div: +ttmCash.toFixed(4), years: implYears.size };
}

async function fetchQuote(code) {
  const sid = push2Secid(code);
  const url = 'https://push2.eastmoney.com/api/qt/stock/get?secid=' + sid + '&fields=f43,f57,f58,f116,f127&invt=2&fltt=2';
  const j = await getJSON(url, { Referer: 'https://quote.eastmoney.com/' });
  const d = j.data || {};
  const price = parseFloat(d.f43) || 0;
  const cap = d.f116 ? d.f116 / 1e8 : 0;
  return { price, cap: cap ? Math.round(cap) + '亿' : '', name: d.f58 || '', industry: d.f127 || '' };
}

async function enrichOne(s) {
  let changed = false;
  if (!s.div || s.div === 0 || !s.years) {
    try {
      const b = await fetchBonus(s.code);
      if (b.div > 0 && (!s.div || s.div === 0)) { s.div = b.div; changed = true; }
      if (!s.years && b.years > 0) { s.years = b.years; changed = true; }
    } catch (e) { console.log('  bonus fail ' + s.code + ': ' + e.message); }
  }
  if (!s.price || s.price === 0 || !s.cap || !s.name || !s.nature) {
    try {
      const q = await fetchQuote(s.code);
      if ((!s.price || s.price === 0) && q.price > 0) { s.price = q.price; changed = true; }
      if (!s.cap && q.cap) { s.cap = q.cap; changed = true; }
      if (!s.name && q.name) { s.name = q.name; changed = true; }
      if (!s.nature && q.industry) { s.nature = q.industry; changed = true; }
    } catch (e) { console.log('  quote fail ' + s.code + ': ' + e.message); }
  }
  if (s.div > 0 && s.price > 0) {
    const ttm = +(s.div / s.price * 100).toFixed(2);
    if (ttm !== s.ttm) { s.ttm = ttm; changed = true; }
  }
  return changed;
}

async function pushFile(p, message) {
  const api = 'https://api.github.com/repos/' + REPO + '/contents/' + p;
  const meta = await fetch(api, { headers: HEADERS });
  const m = await meta.json();
  if (!m.sha) { console.log('push ' + p + ' 失败: 无 sha'); return; }
  const content = fs.readFileSync(path.join(__dirname, p), 'utf8');
  const b64 = Buffer.from(content).toString('base64');
  const r = await fetch(api, { method: 'PUT', headers: HEADERS, body: JSON.stringify({ message, content: b64, sha: m.sha }) });
  const t = await r.text();
  if (r.status === 200 || r.status === 201) console.log('PUSH ' + p + ' OK');
  else console.log('PUSH ' + p + ' 失败 ' + r.status + ' ' + t.slice(0, 200));
}

(async () => {
  const F = path.join(__dirname, 'fundamentals.json');
  const arr = JSON.parse(fs.readFileSync(F, 'utf8'));
  const need = arr.filter(s =>
    (!s.div || s.div === 0 || !s.years || !s.price || s.price === 0 || !s.cap || !s.name || !s.nature)
  );
  if (need.length === 0) {
    console.log('SKIP 无需补全（全部已有分红/行情数据）');
    fs.writeFileSync('.enrich_status', 'none');
    return;
  }
  console.log('需补全 ' + need.length + ' 只: ' + need.map(s => s.code).join(', '));
  let changed = false;
  for (const s of arr) {
    if (need.indexOf(s) >= 0) {
      const c = await enrichOne(s);
      if (c) changed = true;
    }
  }
  fs.writeFileSync(F, JSON.stringify(arr, null, 2));
  fs.writeFileSync('.enrich_status', changed ? 'changed' : 'none');
  if (changed) {
    console.log('本地 fundamentals.json 已补全');
    if (!NO_PUSH && !IS_ACTIONS && TOKEN) await pushFile('fundamentals.json', 'feat: 自动补全分红数据');
  } else {
    console.log('无变化');
  }
})().catch(e => { console.error('ERR', e.message); fs.writeFileSync('.enrich_status', 'none'); process.exit(1); });
