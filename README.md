# 行测刷题网站（xingce-web）

本地优先的行测刷题网站：零依赖 Node 服务 + 原生 JS 前端，题库与考点图谱来自两个开源仓库，**双击即用、全部数据存本机**。

> 题库规模：2016–2026 国考+省考行测真题，515 套卷 / 58,890 题（图片本地化，断网可刷）

## 快速开始

```bash
git clone <本仓库>
cd xingce-web
```

然后（Windows）双击 **`重建数据.bat`** —— 首次会自动从 GitHub 拉取上游题库（约 260MB）并构建 JSON；或手动执行：

```bash
node tools/fetch-bank.cjs          # ① 拉取上游题库 + 考点文件树（需要网络）
node tools/build.mjs               # ② Markdown 题库 → app/data/papers/*.json
node tools/build-knowledge.cjs     # ③ 考点库 → knowledge.json / materials.json / qidmap.json
```

最后双击 **`启动网站.bat`**，浏览器自动打开 `http://localhost:3456`。

> 需要已安装 Node.js（https://nodejs.org/ 下载 LTS 版即可）。

## 功能

### 刷题
- 首页按 年份 / 模块 / 地区 / 关键词 筛选试卷，显示每卷进度与正确率
- 先作答再看答案：点选项立即判对错，展示官方解析；键盘 ←/→ 翻题、数字键选选项
- 资料分析材料跟随：同材料小题切换时材料持续可见（可折叠）
- 图片点击放大（手机支持双指缩放）；逐题计时，用时记入统计
- 纸墨主题（浅色 / 深色 / 跟随系统）

### 考点库（思维导图 + 卡片 + 材料精读）
- 思维导图：模块→大类→考点群→微考点逐层展开，可拖拽平移、滚轮缩放，弹簧动效
- 考点卡片：11,375 个微考点的「核心立场」笔记，逐层面包屑回跳，深链可直达任意层级
- 材料精读：717 篇资料分析材料拆解（口径 / 单位 / 阅读陷阱），原文真渲染
- 考点连做：任意考点的关联真题一键入队，做题页浮条按考点顺序连刷
- 数据源自 [ERRRC/kaogongzhentizhengliu](https://github.com/ERRRC/kaogongzhentizhengliu)（考公脑库），笔记正文经 jsDelivr CDN 懒加载

### 积分与商城
- 首次答对加分、错题改对、每日目标奖励（管理员可改规则）
- 同一道题重复作答不计分，防止刷分
- 积分在商城兑换虚拟商品，兑换生成记录并扣全局库存

### 用户与数据（全部存本机）
- 每个用户一个文件：`data/users/<id>.json`（进度、错题、积分流水、设置）
- 换设备用「同步码」登录即可同步；同一身份多端自动拉取最新记录
- 错题本：错次、连续答对、下次复习日期、错误标签、题目快照（题库更新后错题仍可离线复原）

### 管理员（默认 PIN：8888）
- 「我的 → 管理员身份」解锁后访问 `#/admin`
- 可修改：内置 AI Key 与模型、全局 AI 模式、积分规则、商城商品（增删改/上下架/库存）、用户（积分调整/删除）、管理员 PIN
- 内置 Key 只存本机 `data/config.json`（不入库），前端接口只返回掩码，永不下发明文

### AI 解题助手
- 答题页右下角「问 AI」悬浮窗：多轮流式对话，**换题自动清空记忆**，只围绕当前题目
- 三种模式：内置 Key / 自己的 Key（OpenAI 兼容）/ 彻底关闭
- 防剧透：默认只发题干和选项；管理员打开「允许把答案解析发给 AI」后，已作答的题才会附上解析
- 默认演示模式（mock），在「后台 → AI」填入真实接口地址 + Key 即可切换

### 错题本
- 答错自动收录（含题目快照），连续两次答对自动归档「已掌握」
- 间隔重复：下次复习日期 1→3→7→15→30 天递进，首页显示「错题待复习」
- 详情页可写笔记、打错误标签（粗心/不会/时间不够），一键跳回原题重做

## 数据来源与版权声明

本项目的**题目内容与考点笔记均来自以下开源仓库**，本仓库只包含网站代码与构建脚本，不分发题目数据：

| 仓库 | 用途 | 授权 |
|---|---|---|
| [ERRRC/xingcezhenti](https://github.com/ERRRC/xingcezhenti) | 题库源数据（2016–2026 行测真题 Markdown，经 `tools/build.mjs` 转为 JSON） | 真题题干/选项/解析/配图著作权归原出题机构及原题库平台所有 |
| [ERRRC/kaogongzhentizhengliu](https://github.com/ERRRC/kaogongzhentizhengliu) | 考点知识图谱（文件树 → 导图/卡片/材料精读）；笔记正文运行时从 jsDelivr CDN 懒加载 | 上游自行创作的标注与分类部分采用 [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/legalcode.zh-hans)（非商业性使用） |

**免责声明**：真题题干、选项、材料原文与配图的著作权归原出题机构及原题库平台所有。本项目仅用于个人学习交流，不得用于商业用途。如权利人认为内容侵权，请提 Issue，核实后立即处理。

## 目录结构

```
xingce-web/
├── 启动网站.bat          # 双击启动（localhost:3456）
├── 重建数据.bat          # 首次使用/题库更新：拉取上游 → 构建 JSON
├── server.js             # 本地服务（零依赖 Node：静态资源 + 数据 API + 管理接口）
├── tools/
│   ├── fetch-bank.cjs    # 拉取上游题库（xingcezhenti）+ 考点文件树
│   ├── build.mjs         # Markdown 题库 -> papers/*.json 构建器
│   ├── build-knowledge.cjs # 文件树 -> knowledge/materials/qidmap
│   ├── verify-*.cjs      # 端到端验收脚本（puppeteer-core + Edge）
│   └── fixtures/         # 解析器测试样例
├── app/                  # 前端（原生 JS，无构建步骤）
│   ├── index.html
│   ├── style.css         # 设计系统：token / 组件 / 深色模式
│   ├── views.css         # 页面级布局
│   ├── app.js            # 路由 + 顶部导航
│   ├── js/               # core（工具）store（状态）views（页面）
│   └── data/             # 构建产物（不入库，重建数据.bat 生成）
└── data/                 # 本机运行数据（不入库）
    ├── config.json       # 全局配置（含 AI Key 与 PIN，敏感；模板见 config.example.json）
    ├── users/            # 每用户一份 JSON
    └── xingcezhenti/     # 上游题库（fetch-bank.cjs 下载）
```

## 更新题库数据

```bash
cd data/xingcezhenti && git pull    # 或重新运行 重建数据.bat
node tools/build.mjs
```

## 隐私与安全（脱敏说明）

本仓库**不包含**以下内容（已全部加入 `.gitignore`）：

- `data/config.json` —— 管理员 PIN 与 AI API Key（敏感）。首次使用复制 `data/config.example.json` 为 `config.json`；不复制也能启动，服务会以演示模式兜底
- `data/users/`、`data/messages*` —— 用户答题记录、留言与上传图片（个人信息）
- `data/xingcezhenti/`、`data/main.zip` —— 上游题库（体积大且版权属上游，由脚本按需拉取）
- `app/data/` —— 构建产物，可由 `重建数据.bat` 一键重建
- `tools/shots*/`、`tools/uds*/` —— 验收截图与浏览器临时目录（可能含界面上的用户名）

服务监听 `0.0.0.0`（方便手机在同一局域网访问），请勿将端口暴露到公网；管理员 PIN 仅防误触，不构成安全边界。

## License

- 本仓库的**网站代码与构建脚本**采用 [MIT](LICENSE)
- 经由本网站呈现的**题目与考点笔记内容**，授权与著作权归属遵循上表所述上游仓库的声明（真题内容归原机构，标注部分 CC BY-NC 4.0，非商业使用）
