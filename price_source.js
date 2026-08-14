// 股价拉取：腾讯行情（单源稳定）
// 云端（WorkBuddy 沙箱）网络可稳定到达腾讯 qt.gtimg.cn；
// GitHub Actions runner 为海外 IP，对国内行情源不通，故统一在沙箱环境拉价。
const https = require('https');

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
    const req = https.get(url, { timeout, headers: { 'User-Agent': 'Mozilla/5.0' } }, r => {
      if (r.statusCode !== 200) return reject(new Error('HTTP ' + r.statusCode));
      let d = ''; r.on('data', c => (d += c)); r.on('end', () => resolve(d));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}
function prefixCode(code) {
  if (/^(60|68|90|73|78|11)/.test(code)) return 'sh' + code;
  if (/^(00|02|03|20|30|39|15|16)/.test(code)) return 'sz' + code;
  return (/^6/.test(code) ? 'sh' : 'sz') + code;
}
async function fetchTencent(codes) {
  try {
    const q = codes.map(prefixCode).join(',');
    const txt = await getText('https://qt.gtimg.cn/q=' + q);
    return parseTencent(txt);
  } catch (e) { console.log('腾讯行情拉取失败: ' + e.message); return {}; }
}
// 返回 {prices:{code:price}, fresh:boolean}
async function fetchAllPrices(codes) {
  const result = await fetchTencent(codes);
  const fresh = Object.keys(result).length > 0;
  if (!fresh) console.log('腾讯行情全部缺失，拉取失败');
  else if (Object.keys(result).length < codes.length)
    console.log('腾讯缺失 ' + (codes.length - Object.keys(result).length) + ' 只');
  return { prices: result, fresh };
}
module.exports = { fetchAllPrices, parseTencent };
