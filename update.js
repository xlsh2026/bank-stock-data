// 银行股股价准实时更新脚本（运行于 GitHub Actions，每 15 分钟一次）
// 只拉取「现价」，其余基本面（每股分红/连续分红年数/企业性质/TTM股息率）来自 fundamentals.json（已提交，不常变）
// 拉取失败时回退到上一次 prices.json 或 fundamentals.json 的兜底值，保证 prices.json 永远不为空

const https = require('https');
const fs = require('fs');

const FUND = JSON.parse(fs.readFileSync('fundamentals.json', 'utf8'));
let prev = [];
try { prev = JSON.parse(fs.readFileSync('prices.json', 'utf8')).prices || []; } catch (e) {}
const prevMap = {};
prev.forEach(p => { prevMap[p.code] = p; });

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 15000 }, r => {
      if (r.statusCode !== 200) return reject(new Error('HTTP ' + r.statusCode));
      let d = '';
      r.on('data', c => (d += c));
      r.on('end', () => resolve(d));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

// 解析腾讯行情接口：v_sh601398="1~工商银行~601398~7.52~..."  第3字段(下标3)为现价
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

(async () => {
  const codes = FUND.map(s => (/^6/.test(s.code) ? 'sh' + s.code : 'sz' + s.code));
  const url = 'https://qt.gtimg.cn/q=' + codes.join(',');
  let live = {};
  try {
    const txt = await get(url);
    live = parseTencent(txt);
    console.log('行情拉取成功 ' + Object.keys(live).length + ' 条');
  } catch (e) {
    console.log('行情拉取失败，使用兜底价: ' + e.message);
  }
  const prices = FUND.map(s => {
    const p = (live[s.code] != null) ? live[s.code] : (prevMap[s.code] ? prevMap[s.code].price : s.price);
    const cap = prevMap[s.code] ? (prevMap[s.code].cap || '') : (s.cap || '');
    const est = p > 0 ? +(s.div / p * 100).toFixed(2) : s.ttm;
    return {
      code: s.code, name: s.name, price: p, cap: cap,
      div: s.div, ttm: s.ttm, nature: s.nature, years: s.years, est: est
    };
  });
  const out = {
    updated: new Date().toISOString(),
    source: '腾讯实时行情(自动每15分钟)',
    prices: prices
  };
  fs.writeFileSync('prices.json', JSON.stringify(out, null, 2));
  console.log('已写出 prices.json 时间戳 ' + out.updated);
})();
