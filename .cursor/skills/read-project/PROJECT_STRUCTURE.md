# 项目结构

> 按 `xq/需求.md` §98.1 维护。每次新增/删除/重命名文件后更新本文档。
> Last updated: 2026-06-30

```
read/
├── xq/                              # 需求文档（用户维护）
│   ├── 需求.md                      # 功能需求、AI规范(§98)、版本备注(§99)
│   └── *.jpg / *.png                # UI 参考截图
│
├── SETUP.md                         # 开发环境搭建指南
├── APK_BUILD.md                     # 手机 APK 打包与真机测试（详细步骤）
├── GITHUB_BUILD.md                  # GitHub Actions 云端打包
│
├── .github/workflows/
│   └── build-apk.yml                # 推送 main 自动打 debug APK
│
├── app/                             # 主应用（Capacitor + React + TypeScript）
│   ├── vite.config.ts               # Vite；含 /api/youdao 代理
│   ├── capacitor.config.ts          # Capacitor；CapacitorHttp
│   │
│   ├── src/
│   │   ├── main.tsx                 # React 入口
│   │   ├── App.tsx                  # 根组件；阅读器 / 词典联调 切换
│   │   ├── App.css                  # 全局 UI 样式
│   │   │
│   │   ├── pages/
│   │   │   └── DictDebugPage.tsx    # 词典联调页
│   │   │
│   │   ├── components/bookshelf/
│   │   │   └── BookshelfScreen.tsx  # 应用首页书架（木质 UI）
│   │   │
│   │   ├── components/reader/
│   │   │   ├── ReaderScreen.tsx     # 阅读器主屏（视口分页、翻页、点词、面板）
│   │   │   ├── useViewportPagination.ts # 视口高度测量与页数计算
│   │   │   ├── useInlineGlosses.ts    # 视口可见词惰性查词、行间释义
│   │   │   ├── ChapterContent.tsx   # 逐词渲染 + 行间释义 + 插图
│   │   │   ├── WordDetailPopup.tsx  # 点击单词弹出的释义浮窗
│   │   │   ├── ReaderControlPanel.tsx # 底部房子唤出的控制面板
│   │   │   ├── TocPanel.tsx         # 章节目录侧栏
│   │   │   ├── ReadingSettingsPanel.tsx # 字号/行距/字体/背景/行间翻译
│   │   │   └── tokenize.ts          # 英文单词切分
│   │   │
│   │   ├── lib/
│   │   │   ├── examLevel.ts         # 考试等级比较（行间翻译过滤）
│   │   │   ├── formatInlineGloss.ts # 行间释义文案格式化
│   │   │   └── lemmatize.ts         # 词形还原
│   │   │
│   │   └── services/
│   │       ├── dictionary/          # 有道 API + IndexedDB 缓存 + 发音
│   │       │   ├── youdao.ts
│   │       │   ├── cache.ts
│   │       │   ├── speech.ts        # 内联 Audio 播放
│   │       │   ├── types.ts
│   │       │   └── index.ts
│   │       ├── epub/
│   │       │   ├── parser.ts        # EPUB 解压、OPF/spine、插图 blob
│   │       │   ├── import.ts        # 浏览器/手机 EPUB 导入
│   │       │   ├── library.ts       # 书架书籍注册表（手机）
│   │       │   ├── progress.ts      # 阅读进度（chapterIndex + pageIndex）
│   │       │   ├── types.ts
│   │       │   └── index.ts
│   │       └── settings/
│   │           ├── readingSettings.ts # 字号/行距/主题/字体栈
│   │           └── userSettings.ts    # 英语水平、行间翻译开关
│   │
│   ├── dist/                        # 构建产物
│   └── android/                     # Android 工程
│
└── .cursor/
    ├── rules/read-project.mdc
    └── skills/read-project/
        ├── SKILL.md
        ├── PROGRESS.md
        ├── PROJECT_STRUCTURE.md     # 本文件
        ├── ARCHITECTURE.md
        └── KNOWN_ISSUES.md
```

## 文件说明（按模块）

| 模块 | 路径 | 作用 |
|------|------|------|
| 书架首页 | `components/bookshelf/BookshelfScreen.tsx` | 木质书架、导入、打开书籍 |
| 阅读器 | `components/reader/ReaderScreen.tsx` | 阅读页（由书架进入） |
| 控制面板 | `components/reader/ReaderControlPanel.tsx` | 退出、目录、设置入口 |
| 目录 | `components/reader/TocPanel.tsx` | 章节列表跳转 |
| 阅读设置 | `components/reader/ReadingSettingsPanel.tsx` | 字号、行距、字体、背景、英语水平 |
| 行间翻译 | `components/reader/useInlineGlosses.ts` | 当前页可见词查词并生成释义 |
| 逐词渲染 | `components/reader/ChapterContent.tsx` | 不用 iframe，单词可点击，支持行间释义 |
| EPUB 解析 | `services/epub/parser.ts` | jszip + OPF/spine + 插图 |
| 书架 | `services/epub/library.ts` | 已导入书籍元数据 |
| 阅读进度 | `services/epub/progress.ts` | chapterIndex + pageIndex |
| 阅读设置存储 | `services/settings/readingSettings.ts` | Preferences / localStorage |
| 用户设置 | `services/settings/userSettings.ts` | 英语水平、行间翻译 |
| 词典 | `services/dictionary/` | 联网查词 + 缓存 + 发音 |

## 计划中（尚未创建）

| 路径 | 用途 |
|------|------|
| `components/reader/InlineTranslation.tsx` | 行间注释 |
| `components/bookshelf/` | 分组、换肤完整版 |
| `services/notes/` | 笔记与划线 |
