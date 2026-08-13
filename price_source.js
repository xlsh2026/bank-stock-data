// 双源股价拉取：腾讯(主) + 东方财富(兜底)
// 任一源对某只失败，自动用另一源补齐；全部失败返回 fresh=false
const https = require('https');

function emSecid(code) {
  const c = code.replace(/^(sh|sz)/, '');
  if (/^(60|68|90|73|78|11)/.test(c)) return '1.' + c;
  if (/^(00|02|03|20|30|39|15|16)/.test(c)) return '0.' + c;
  return (/^6/.test(c) ? '1.' : '0.') + c;
}
function parseTencent(txt) {
  const out = {};
  txt.split(';').forEach(line => {
    const m = line.match(/v_(sh|sz)(\d+)="([^"]*)"/);
    if (!m) return;
    const f = m[3].split('~');
    const price = parseFloat(f[3]);
    if (!isNaN(price) && price > 0) out[m[2]] = price;
  });
  return out;
}
function getText(url, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout }, r => {
      if (r.statusCode !== 200) return reject(new Error('HTTP ' + r.statusCode));
      let d = ''; r.on('data', c => (d += c)); r.on('end', () => resolve(d));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}
async function fetchTencent(codes) {
  try {
    const txt = await getText('https://qt.gtimg.cn/q=' + codes.join(','));
    return parseTencent(txt);
  } catch (e) { console.log('腾讯批量拉取失败，转东财: ' + e.message); return {}; }
}
async function fetchEastMoney(codes) {
  const out = {};
  for (const code of codes) {
    const sid = emSecid(code);
    try {
      const r = await fetch('https://push2.eastmoney.com/api/qt/stock/get?secid=' + sid + '&fields=f43&invt=2&fltt=2', { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const j = await r.json();
      const d = j.data || {};
      const p = parseFloat(d.f43);
      if (!isNaN(p) && p > 0) out[code] = p;
    } catch (e) { /* 单只失败忽略 */ }
    await new Promise(r => setTimeout(r, 100));
  }
  return out;
}
// 返回 {prices:{code:price}, fresh:boolean}
async function fetchAllPrices(codes) {
  const tq = await fetchTencent(codes);
  const result = Object.assign({}, tq);
  let fresh = Object.keys(tq).length > 0;
  const missing = codes.filter(c => result[c] == null);
  if (missing.length) {
    console.log('腾讯缺失 ' + missing.length + ' 只，用东方财富补齐: ' + missing.join(','));
    const em = await fetchEastMoney(missing);
    Object.assign(result, em);
  }
  const stillMissing = codes.filter(c => result[c] == null);
  if (stillMissing.length) console.log('双源均缺失 ' + stillMissing.length + ' 只: ' + stillMissing.join(','));
  return { prices: result, fresh };
}
module.exports = { fetchAllPrices, emSecid, parseTencent };
