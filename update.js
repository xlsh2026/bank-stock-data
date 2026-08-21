// 银行股股价准实时更新脚本（运行于 GitHub Actions，每 15 分钟一次）
// 只拉取「现价」，其余基本面（每股分红/连续分红年数/每股收益）来自 fundamentals.json（已提交，不常变）
// 拉取失败时回退到上一次 prices.json 或 fundamentals.json 的兜底值，保证 prices.json 永远不为空
// 注意：输出 schema 必须含 eps（支付率% 依赖它），且不得复活已废弃的 ttm/nature 字段

const https = require('https');
const fs = require('fs');
const { fetchAllPrices } = require('./price_source');

const FUND = JSON.parse(fs.readFileSync('fundamentals.json', 'utf8'));
let prev = [];
let prevUpdated = null;
try {
  const prevObj = JSON.parse(fs.readFileSync('prices.json', 'utf8'));
  prev = prevObj.prices || [];
  prevUpdated = prevObj.updated;
} catch (e) {}
const prevMap = {};
prev.forEach(p => { prevMap[p.code] = p; });

(async () => {
  const codes = FUND.map(s => s.code);
  const { prices: live, fresh } = await fetchAllPrices(codes);
  console.log('行情拉取成功 ' + Object.keys(live).length + '/' + codes.length + ' 条, fresh=' + fresh);

  // 关键修复：拉取彻底失败时不刷新时间戳，避免掩盖陈旧数据
  const updated = fresh ? new Date().toISOString() : (prevUpdated || new Date().toISOString());

  const prices = FUND.map(s => {
    const p = (live[s.code] != null) ? live[s.code] : (prevMap[s.code] ? prevMap[s.code].price : s.price);
    const cap = prevMap[s.code] ? (prevMap[s.code].cap || '') : (s.cap || '');
    const est = p > 0 ? +(s.div / p * 100).toFixed(2) : (s.est || null);
    return {
      code: s.code, name: s.name, price: p, cap: cap,
      div: s.div, eps: s.eps, years: s.years, est: est
    };
  });
  const out = {
    updated: updated,
    source: '腾讯+东方财富双源实时行情',
    prices: prices
  };
  fs.writeFileSync('prices.json', JSON.stringify(out, null, 2));
  console.log('已写出 prices.json 时间戳 ' + out.updated + (fresh ? '' : ' [注意: 本次拉取失败, 沿用旧时间戳]'));
})();
