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
2. **惰性行间翻译**（待实现）：仅对当前视口内可见单词查词/缓存

**曾用过渡方案**：`scrollTop` 章内滚动（已废弃，旧数据 `pageIndex` 缺省为 0）

**目录与 spine**：目录用 NCX/nav；阅读按章节 + 页码恢复。

**章节标题**：优先 NCX/nav 标签；禁止用 HTML `<title>`（常为书名）；正文标题需与书名去重。

## 词典 API（已确认）

**主数据源：有道 `jsonapi_s`（免费，无需 API Key）**

```
GET https://dict.youdao.com/jsonapi_s?doctype=json&jsonversion=4&q={单词}
```

解析 `ec` 字段：
- `word.usphone` / `word.ukphone` — 音标
- `exam_type` — 中考/高考/CET4/雅思…
- `word.trs[]` — `{ pos, tran }` 中文释义
- `word.wfs[]` — 词形变体
美音：`https://dict.youdao.com/dictvoice?audio={lemma}&type=2`（**必须用 lemma 原文**，不可用 API 返回的 `usspeech` 字段，否则长词发音截断）

**本地缓存**：IndexedDB（库名 `read-dictionary`），`idb` 包。  
**实现路径**：`app/src/services/dictionary/`

**词形还原**：`compromise` + 不规则动词表，见 `app/src/lib/lemmatize.ts`

**开发环境跨域**：浏览器走 Vite 代理 `/api/youdao`；APK 内开启 `CapacitorHttp`。

**为何选有道**：与 v1 截图字段一致（中文释义、等级、音标、变体）；国内可用；正常查词量免费。

**备注**：有道 `ec` 不含 BNC/COCA 词频；若后续需要可叠加 ECDICT。

## 目录结构（当前）

详见 [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md)。
