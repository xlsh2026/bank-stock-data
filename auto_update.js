// 银行股股价「兜底自动更新」脚本
// 由 workbuddy 定时任务调用，用户无需任何操作。
// 逻辑：
//   1) 非交易时段（北京时间 09:00-11:30 / 13:00-15:00 之外）直接跳过，不消耗任何请求
//   2) 交易时段内，先检查 GitHub 上的 prices.json 是否新鲜（15 分钟内）
//        - 新鲜 → 跳过（说明 GitHub Actions 定时任务正常工作，无需重复）
//        - 过期 → 重新拉取腾讯实时价并推回 GitHub，保证页面永远是最新价
// 环境变量 FORCE=1 可强制刷新（用于测试）。

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { fetchAllPrices } = require('./price_source');

// ---- 读取令牌（仅本地，不会上传到 GitHub）----
let TOKEN;
try {
  TOKEN = fs.readFileSync(path.join(__dirname, '.gh_token'), 'utf8').trim();
} catch (e) {
  console.log('未找到 .gh_token，无法推送');
  process.exit(1);
}
const FORCE = process.env.FORCE === '1';
const REPO = 'xlsh2026/bank-stock-data';
const FILE = 'prices.json';
const HEADERS = {
  Authorization: 'Bearer ' + TOKEN,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'wb-autobackup',
  'Content-Type': 'application/json'
};
const STALE_MS = 15 * 60 * 1000;

// ---- 北京时间判断（避免收盘后无意义的提交）----
function beijingNow() {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000; // 转成 UTC 毫秒
  return new Date(utcMs + 8 * 3600000); // 加 8 小时得北京时间
}
function inTrading() {
  const d = beijingNow();
  const wd = d.getDay(); // 0=周日 6=周六
  if (wd === 0 || wd === 6) return false;
  const mins = d.getHours() * 60 + d.getMinutes();
  const morning = mins >= 540 && mins <= 690;  // 09:00-11:30
  const afternoon = mins >= 780 && mins <= 900; // 13:00-15:00
  return morning || afternoon;
}

// 推送 fundamentals.json（补全分红后调用）
async function pushFundamentals() {
  const api = 'https://api.github.com/repos/' + REPO + '/contents/fundamentals.json';
  const meta = await fetch(api, { headers: HEADERS });
  const m = await meta.json();
  if (!m.sha) { console.log('获取 fundamentals.json sha 失败'); return; }
  const content = fs.readFileSync(path.join(__dirname, 'fundamentals.json'), 'utf8');
  const b64 = Buffer.from(content).toString('base64');
  const r = await fetch(api, {
    method: 'PUT', headers: HEADERS,
    body: JSON.stringify({ message: 'feat: 自动补全分红数据 ' + new Date().toISOString().slice(0, 16), content: b64, sha: m.sha })
  });
  const t = await r.text();
  if (r.status === 200 || r.status === 201) console.log('PUSH fundamentals.json OK');
  else { console.log('PUSH fundamentals.json 失败 ' + r.status + ' ' + t.slice(0, 200)); }
}

(async () => {
  // 0) 自动补全分红数据（静态数据，不受交易时段限制）
  try {
    execSync('node ' + path.join(__dirname, 'enrich_fundamentals.js') + ' --no-push', { stdio: 'inherit' });
  } catch (e) { console.log('enrich 执行异常(忽略):', e.message); }
  let enrichChanged = 'none';
  try { enrichChanged = fs.readFileSync(path.join(__dirname, '.enrich_status'), 'utf8').trim(); } catch (e) {}
  if (enrichChanged === 'changed') {
    console.log('检测到分红数据已补全，推送 fundamentals.json');
    await pushFundamentals();
  }

  // 1) 非交易时段直接跳过
  if (!inTrading()) {
    console.log('SKIP 当前非交易时段（北京时间），不更新');
    return;
  }

  // 2) 检查远端是否新鲜
  const metaRes = await fetch('https://api.github.com/repos/' + REPO + '/contents/' + FILE, { headers: HEADERS });
  const meta = await metaRes.json();
  if (!meta.content) {
    console.log('获取远端 prices.json 失败: ' + JSON.stringify(meta).slice(0, 200));
    process.exit(1);
  }
  const data = JSON.parse(Buffer.from(meta.content, 'base64').toString());
  const age = Date.now() - new Date(data.updated).getTime();
  if (!FORCE && age < STALE_MS) {
    console.log('SKIP 远端数据新鲜（' + Math.round(age / 1000) + ' 秒前更新），GitHub 定时任务正常');
    return;
  }
  console.log((FORCE ? 'FORCE ' : '远端过期（' + Math.round(age / 60000) + ' 分钟前），') + '重新拉取并推送');

  // 3) 拉取最新价（腾讯行情单源，运行于 WorkBuddy 沙箱，网络可达）
  const FUND = JSON.parse(fs.readFileSync(path.join(__dirname, 'fundamentals.json'), 'utf8'));
  const codes = FUND.map(s => s.code);
  const { prices: live, fresh } = await fetchAllPrices(codes);
  if (!fresh) {
    console.log('行情拉取失败，保留原数据（不推送）');
    return;
  }
  console.log('行情拉取成功 ' + Object.keys(live).length + '/' + codes.length + ' 条');
  const prices = FUND.map(s => {
    const p = (live[s.code] != null) ? live[s.code] : s.price;
    const est = p > 0 ? +(s.div / p * 100).toFixed(2) : s.ttm;
    return { code: s.code, name: s.name, price: p, cap: s.cap || '', div: s.div, ttm: s.ttm, nature: s.nature, years: s.years, est: est };
  });
  const out = { updated: new Date().toISOString(), source: '腾讯实时行情(WorkBuddy自动更新)', prices };
  const b64 = Buffer.from(JSON.stringify(out, null, 2)).toString('base64');

  // 4) 推送
  const putRes = await fetch('https://api.github.com/repos/' + REPO + '/contents/' + FILE, {
    method: 'PUT', headers: HEADERS,
    body: JSON.stringify({ message: 'chore: 兜底自动更新股价 ' + out.updated.slice(0, 16), content: b64, sha: meta.sha })
  });
  const putData = await putRes.json();
  if (putRes.status === 200 || putRes.status === 201) console.log('PUSH 成功 commit ' + (putData.commit && putData.commit.sha));
  else { console.log('PUSH 失败 ' + putRes.status + ' ' + JSON.stringify(putData).slice(0, 300)); process.exit(1); }
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
