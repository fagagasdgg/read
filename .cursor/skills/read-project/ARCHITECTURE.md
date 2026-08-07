# 架构决策

> 做出或变更技术选型时更新本文档。

## 平台选型（已确认 2026-06-29）

### 评估维度（来自 `xq/需求.md` §2）

| 维度 | 纯网页 | APK（Capacitor） | APK（原生 Kotlin） |
|------|--------|------------------|-------------------|
| 运行稳定性 | 中 — v1 有严重问题 | 较好 — 原生壳 + 可控 WebView | EPUB 阅读最佳 |
| 功能复杂度 | 自定义渲染可实现 | 同一套代码，可打包 APK | 逐词 UI 开发更难 |
| 能否实现全部功能 | 可以（需自定义渲染） | **可以（推荐）** | 可以，周期更长 |
| 分发方式 | 链接 / PWA | 可安装 APK | 可安装 APK |
| 开发速度 | 最快 | 快 | 最慢 |

### 最终决策：**Capacitor + React + TypeScript → APK**

**不选纯网页的原因**：用户倾向 APK；需要持久化文件访问和可安装应用。

**不直接用 epub.js 默认渲染的原因**：v1 踩坑（选区错位、进度跳转、无限加载）。epub.js 的 iframe 模型与逐词叠加层、自定义笔记逻辑冲突。

**不选原生 Kotlin 的原因**：核心是自定义文本 + 叠加层 + 词典，用 Web 技术即可实现；单代码库迭代更快。Readium Kotlin 适合标准阅读器，但对行间注释引擎反而增加复杂度。

**备选方案**：若低端机 WebView 性能不足，可将渲染层迁到 Flutter 或原生 Readium；数据层（SQLite 结构、词典缓存）保持可迁移。

## 技术栈

```
┌─────────────────────────────────────────┐
│  Capacitor 壳（Android APK）            │
├─────────────────────────────────────────┤
│  React + TypeScript + Vite              │
│  ├── UI：书架、阅读器、弹窗             │
│  ├── EPUB：jszip + 自定义 XHTML 解析    │
│  ├── 渲染：逐词 <span> 树               │
│  ├── 词典：免费 API + 本地缓存          │
│  └── 词形：compromise.js + 不规则表     │
├─────────────────────────────────────────┤
│  @capacitor/filesystem — EPUB 文件      │
│  @capacitor/preferences 或 SQLite       │
│    — 进度、笔记、词典、设置             │
└─────────────────────────────────────────┘
```

## EPUB 渲染策略（关键）

**禁止**：用 epub.js 默认阅读器在沙箱 iframe 中渲染。

**应当**：
1. 解压 EPUB，解析 OPF/spine，加载章节 XHTML
2. 净化 HTML，遍历文本节点
3. 每个单词包在 `<span data-word="lemma">` 中，附带位置元数据
4. 行间翻译用绝对定位的兄弟节点叠加
5. 进度保存用 CFI 或自定义锚点（章节 + 段落 + 词偏移）

这样可实现：逐词点击、注释对齐、可控的笔记选区。

## 数据模型（草案）

```
Book         { id, title, author, coverPath, filePath, groupId?, sortOrder, lastReadAt }
Group        { id, name, sortOrder }
ReadingProgress { bookId, chapterIndex, pageIndex, updatedAt }
WordEntry    { lemma, phonetic, level, meanings[], variants[], cachedAt }
WordNote     { id, lemma, text, createdAt }
MasteredWord { lemma }
UserSettings { englishLevel, inlineFontSize, inlineColor, maxMeanings, offsetX, offsetY, ... }
```

## 阅读分页与行间翻译（规划）

当前实现按 **spine 一项 = 一个阅读单元** 整章滚动展示。部分 EPUB（如哈利波特）spine 仅 3 项，单章 HTML 极大。

**已知风险**（用户真机反馈 2026-06-30）：
- 整章加载 + 未来行间翻译会对全章单词批量查词，耗时长、占内存
- 仅记录章节序号时，章内阅读位置会丢失

**已实现（2026-06-30）**：
1. **视口分页**：完整渲染章节后按 `scrollHeight / 视口高度` 计算页数，`translateY` 切换页；进度 `chapterIndex + pageIndex`
2. **惰性行间翻译**（已实现 MVP）：`useInlineGlosses` 仅对当前视口可见单词查词；按 `examLevel` 与用户水平过滤

**曾用过渡方案**：`scrollTop` 章内滚动（已废弃，旧数据 `pageIndex` 缺省为 0）

**目录与 spine**：目录用 NCX/nav；阅读按章节 + 页码恢复。

**章节标题**：优先 NCX/nav 标签；禁止用 HTML `<title>`（常为书名）；正文标题需与书名去重。

## 词典 API（已确认）

**查词分层（2026-08-04）**

| 层 | 职责 | 是否写 IndexedDB |
|----|------|------------------|
| ECDICT 本地 | 词形还原、默认弹窗释义、行间翻译优先 | **否** |
| IndexedDB 缓存 | 仅有道/词霸联网结果 | 是 |
| 有道 / 词霸 | 「网络」面板与缺本地词时的回退 | 是 |

**弹窗**：默认展示 ECDICT（词性释义、考试标签、COCA=`frq`/BNC/柯林斯、exchange 变体）；**美/英音标与喇叭优先用联网缓存（有道/词霸）**，无联网音标再退回 ECDICT；发音与词组仍联网；标题旁「网络」⇄「本地」仅切换释义来源。联网面板逻辑与旧版一致（美/英音标、柯林斯+真题频次等）。

**行间预取**：`useInlineGlosses` 对当前屏 + 邻页批量查词。ECDICT 可提供行间释义时仍会补拉「尚无 IndexedDB 联网缓存」的词条（写入有道/词霸结果），供弹窗音标复用；联网失败不把已有 ECDICT 的词标成 notFound。

**键统一**：`resolveLemma()`（ECDICT lemma_map → compromise）得到原型；已掌握、词组、弹窗标题共用该原型。旧表面形词组会在读取时迁移到原型 key。

### ECDICT 本地全量

- 构建：`app/scripts/build_ecdict_db.py`（`npm run dict:build`）
- 产物：`app/public/dict/ecdict.db`（约 100MB+，gitignore；CI 构建时下载 CSV 生成）
- 运行时：`sql.js`；`services/dictionary/ecdict.ts` / `resolveLemma.ts`
- 发音仍走有道 TTS

**联网主数据源：有道 `jsonapi_s`（免费，无需 API Key）**

```
GET https://dict.youdao.com/jsonapi_s?doctype=json&jsonversion=4&q={单词}
```

解析 `ec` 字段：
- `word.usphone` / `word.ukphone` — 音标
- `exam_type` — 中考/高考/CET4/雅思…
- `word.trs[]` — `{ pos, tran }` 中文释义
- `word.wfs[]` — 词形变体
美音：`https://dict.youdao.com/dictvoice?audio={lemma}&type=2`（**必须用 lemma 原文**）

**本地缓存**：IndexedDB（库名 `read-dictionary`），`idb` 包；**不含** ECDICT 全量。  
**实现路径**：`app/src/services/dictionary/`

**词形还原**：ECDICT `lemma_map` 优先，其次 `compromise`，见 `resolveLemma.ts`

**开发环境跨域**：浏览器走 Vite 代理 `/api/youdao`；APK 内开启 `CapacitorHttp`。

| 词典 | `services/dictionary/` | ECDICT 本地 + 联网查词 + 缓存 + 发音 + 信源状态 |

**信源状态**：仅统计有道/词霸联网；ECDICT 不参与探测。

## 目录结构（当前）

详见 [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md)。
