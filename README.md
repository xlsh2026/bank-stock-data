# 银行股股价「准实时」自动更新（GitHub Actions）

让银行股收息台在 A 股交易时段**每 15 分钟自动刷新股价和推算股息率**，你不用再手动喊更新。

> 说明：这是「快照级准实时」（每 15 分钟拉一次），不是行情软件那种逐笔跳动。银行股波动小，15 分钟够用。

---

## 这个仓库里有什么

| 文件 | 作用 |
|---|---|
| `update.js` | 在 GitHub 服务器上运行，拉腾讯行情接口的最新价，生成 `prices.json` |
| `fundamentals.json` | 银行股及收息股（含长江电力等）的基本面（每股分红/连续分红年数/企业性质/TTM股息率），不常变 |
| `.github/workflows/update.yml` | 定时任务：交易时段每 15 分钟跑一次 `update.js` 并提交 `prices.json` |

`prices.json` 由工作流自动生成并提交，你**不需要手动维护**。

---

## 你需要做的（一次性，约 5 分钟）

### 1. 注册 GitHub
没有账号先去 https://github.com 注册（免费）。

### 2. 新建公开仓库
- 点右上角 `+` → `New repository`
- Repository name 填 `bank-stock-data`
- 选 **Public**（公开，这样页面才能跨域读取）
- 不要勾选 "Add a README"（我们已经有了）
- 点 `Create repository`

### 3. 上传这 3 个文件
把本仓库里的以下文件上传到新仓库（直接拖进去或 `Add file`）：
- `update.js`
- `fundamentals.json`
- `.github/workflows/update.yml`

> 注意 `.github` 是隐藏文件夹，上传时保持目录结构不变。

### 4. 手动跑一次，生成 `prices.json`
- 进入仓库 → `Actions` 标签 → 左侧 `银行股股价准实时更新` → `Run workflow` → 确认
- 等 1 分钟左右，仓库里会出现 `prices.json`，说明成功

之后它会按交易时段自动每 15 分钟更新，无需你再管。

### 5. 让页面读取这个数据源
打开你的收息台页面文件（`银行股收息台.html`），找到这一行：

```js
var GH_USER="你的GitHub用户名";        // ← 改成你的 GitHub 用户名
var GH_REPO="bank-stock-data";        // ← 改成你的仓库名
```

把 `你的GitHub用户名` 改成你的 GitHub 用户名，保存、重新部署即可。

（若页面是部署在 CloudStudio 上的，改完重新部署一次；在配好之前页面会自动用 CloudStudio 自带的底表兜底，不会白屏。）

---

## 自动更新的「双重保险」

股价新鲜度靠两层机制保证，任何一层抽风都不会让页面长期停更：

1. **GitHub Actions 原生定时（主）**：交易时段每 15 分钟跑一次 `update.js` 拉腾讯实时价并提交 `prices.json`。
   - 注意：新仓库 / 低活跃度仓库的 GitHub 定时调度器有时要等一段时间才会激活（可能数小时到数天），期间不会自动跑。属 GitHub 平台侧行为，不是配置错误。
2. **兜底自动更新（备）**：本地 `auto_update.js` 配合 workbuddy 每小时定时任务——非交易时段跳过、交易时段检测远端 `prices.json` 是否新鲜（15 分钟内），过期才拉价推送。平时多数为 SKIP，不费事；原生定时失效时它顶上，最坏滞后约 1 小时。

> 想手动立即刷新？页面点「📥 载入最新底表」即可；或本地跑 `FORCE=1 node auto_update.js`。

---

## 常见问题

**Q：会不会消耗很多 GitHub 免费额度？**
公开仓库的 Actions 是**免费且不限量**的，放心用。

**Q：周末/休市会跑吗？**
不会。定时只在周一至周五的交易时段（09:30-11:30、13:00-15:00 北京时间）触发。

**Q：GitHub 被墙/打不开怎么办？**
页面已做了兜底：GitHub 拉不到时会自动用部署平台自带的底表，并用「📥 载入最新底表」按钮可随时手动恢复。如果 raw.githubusercontent.com 在你的网络下不稳定，可把 `DATA_URL` 改成 jsDelivr 镜像：
```js
var DATA_URL="https://cdn.jsdelivr.net/gh/你的GitHub用户名/bank-stock-data@main/prices.json";
```

**Q：想改成每 30 分钟 / 每小时？**
编辑 `.github/workflows/update.yml` 里的 cron 表达式即可（UTC 时间 = 北京时间 - 8 小时）。

---

## 把工作台页面也搬到这里（彻底摆脱 CloudStudio 不稳定）

CloudStudio 部署后端偶尔抽风（504），如果你受够了，可以把 `银行股收息台.html` 也放进本仓库并开启 **GitHub Pages**，得到一个**永远在线、不会被平台拖垮**的稳定链接。

### 步骤

1. 把你的页面文件 `银行股收息台.html` 上传到本仓库**根目录**（和 `update.js`、`fundamentals.json` 同级）。
   - 文件名建议改成英文，比如 `index.html`（GitHub Pages 默认优先读 `index.html`，链接更简洁）。
2. 仓库页面 → 顶部 **`Settings`** → 左侧 **`Pages`**（在底部 "Code and automation" 区）。
3. **Build and deployment** → **Source** 选 `Deploy from a branch`。
4. **Branch** 选 `main`，**folder** 选 `/ (root)`，点 **`Save`**。
5. 等 1~2 分钟，页面会显示绿色链接：

```
https://xlsh2026.github.io/bank-stock-data/index.html
```

### 为什么这样就稳了

- 页面和 `prices.json` 在**同一个仓库**，GitHub Actions 自动更新股价，GitHub Pages 自动托管页面，**两端都不依赖 CloudStudio**。
- 页面读取数据的顺序是：GitHub raw → jsDelivr 镜像 → 同域兜底，三道保险，国内访问也基本稳。
- 免费、公开仓库不限量。

> 小提示：公开仓库意味着任何人拿到链接都能读这个页面和里面的银行股公开行情数据（无隐私），可以放心公开。

