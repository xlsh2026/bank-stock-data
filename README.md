# 银行股股价「准实时」自动更新（GitHub Actions）

让银行股收息台在 A 股交易时段**每 15 分钟自动刷新股价和推算股息率**，你不用再手动喊更新。

> 说明：这是「快照级准实时」（每 15 分钟拉一次），不是行情软件那种逐笔跳动。银行股波动小，15 分钟够用。

---

## 这个仓库里有什么

| 文件 | 作用 |
|---|---|
| `update.js` | 在 GitHub 服务器上运行，拉腾讯行情接口的最新价，生成 `prices.json` |
| `fundamentals.json` | 42 只银行股的基本面（每股分红/连续分红年数/企业性质/TTM股息率），不常变 |
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
