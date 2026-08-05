# 项目结构

> 按 `xq/需求.md` §98.1 维护。每次新增/删除/重命名文件后更新本文档。
> Last updated: 2026-08-05

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
│   └── build-apk.yml                # 推送 main 自动打 debug APK（含 ECDICT 构建）
│
├── app/                             # 主应用（Capacitor + React + TypeScript）
│   ├── vite.config.ts               # Vite；含 /api/youdao、/api/youdao-fanyi 代理
│   ├── capacitor.config.ts          # Capacitor；CapacitorHttp
│   ├── scripts/
│   │   └── build_ecdict_db.py       # ECDICT CSV → public/dict/ecdict.db
│   ├── public/
│   │   └── dict/
│   │       ├── .gitkeep
│   │       └── ecdict.db            # 本地生成，约 100MB+（gitignore）
│   │
│   ├── src/
│   │   ├── main.tsx                 # React 入口
│   │   ├── App.tsx                  # 根组件；预热 ECDICT；阅读器 / 词典联调 切换
│   │   ├── App.css                  # 全局 UI 样式
│   │   │
│   │   ├── pages/
│   │   │   └── DictDebugPage.tsx    # 词典联调页
│   │   │
│   │   ├── components/bookshelf/
│   │   │   ├── BookshelfScreen.tsx  # 书架网格、分组、导入删除
│   │   │   └── DataBackupSheet.tsx  # 学习数据 zip 导入导出
│   │   ├── contexts/
│   │   │   └── AppShellThemeContext.tsx # 应用界面风格上下文
│   │   ├── components/home/
│   │   │   └── HomeShell.tsx        # 底部 Tab：书架 / 笔记 / 统计 / 工具 / 设置
│   │   ├── components/tools/
│   │   │   ├── ToolsScreen.tsx      # 工具页
│   │   │   └── BookWordFrequencyTool.tsx # 全书词频统计（离线 ECDICT）
│   │   ├── components/statistics/
│   │   │   └── StatisticsScreen.tsx # 阅读时长 + 词汇统计（可展开收起）
│   │   ├── components/notes/
│   │   │   ├── NotesScreen.tsx      # 阅读笔记 / 词频统计 双页签
│   │   │   ├── NotebookDetailScreen.tsx # 笔记条目列表 + 详情（分页；词频本专用列表）
│   │   │   ├── NotFoundWordEditor.tsx   # 待补全词条手动/豆包录入
│   │   │   └── NotebookPickerSheet.tsx  # 保存笔记时选择笔记本
│   │   ├── components/settings/
│   │   │   ├── AppSettingsScreen.tsx    # 应用级设置（含界面风格）
│   │   │   ├── AppShellThemePicker.tsx  # 界面风格选择器
│   │   │   ├── CollapsibleSettingsSection.tsx # 设置页可折叠区块
│   │   │   ├── ZhipuApiSection.tsx      # 智谱 API Key 配置
│   │   │   ├── DictionarySourcesSection.tsx
│   │   │   └── BackupDirectorySection.tsx
│   │   │
│   │   ├── components/reader/
│   │   │   ├── ReaderScreen.tsx     # 阅读器主屏（视口分页、翻页、点词、面板）
│   │   │   ├── useViewportPagination.ts # 视口高度测量与页数计算
│   │   │   ├── useInlineGlosses.ts    # 视口可见词惰性查词、行间释义
│   │   │   ├── ChapterContent.tsx   # 逐词渲染 + 行间释义 + 插图
│   │   │   ├── WordDetailPopup.tsx  # 点击单词弹出的释义浮窗
│   │   │   ├── WordPhraseSection.tsx # 词组获取/展示/补充/清空
│   │   │   ├── ReaderControlPanel.tsx # 底部房子唤出的控制面板
│   │   │   ├── SettingStepper.tsx   # 设置项步进器（防滚动误触）
│   │   │   ├── TocPanel.tsx         # 目录/笔记侧栏
│   │   │   ├── ReadingSettingsPanel.tsx # 排版、行间翻译、本书默认笔记本
│   │   │   ├── SelectionToolbar.tsx   # 选段：复制、深度解析、存笔记
│   │   │   ├── useTextSelection.ts    # 阅读区文本选区检测
│   │   │   └── tokenize.ts          # 英文单词切分
│   │   │
│   │   ├── lib/
│   │   │   ├── examLevel.ts         # 考试等级比较（行间翻译过滤）
│   │   │   ├── formatInlineGloss.ts # 行间释义文案格式化（词性数 + 每词性释义数）
│   │   │   ├── splitTranslationMeanings.ts # 拆分同一词性下的多个释义
│   │   │   ├── pickYoudaoText.ts    # 解析有道嵌套文本字段
│   │   │   └── lemmatize.ts         # 词形还原
│   │   │
│   │   └── services/
│   │       ├── dictionary/          # ECDICT 本地 + 有道/词霸、缓存、信源状态
│   │       │   ├── ecdict.ts        # sql.js 查询本地全量库
│   │       │   ├── resolveLemma.ts  # ECDICT 优先的词形还原（供词组/已掌握共用）
│   │       │   ├── youdao.ts
│   │       │   ├── iciba.ts
│   │       │   ├── lookup.ts        # 多信源串联查词（联网）
│   │       │   ├── wordFrequency.ts # 词频展示（柯林斯/真题/BNC/当代）
│   │       │   ├── batchFrequency.ts # 批量补全词频
│   │       │   ├── manualWord.ts    # 手动词条校验与保存
│   │       │   ├── providers.ts     # 信源元数据
│   │       │   ├── sourceStatus.ts  # 信源健康度与统计
│   │       │   ├── fetchPhrases.ts  # 有道词组 phrs 联网获取
│   │       │   ├── cache.ts
│   │       │   ├── speech.ts        # 内联 Audio 播放
│   │       │   ├── types.ts
│   │       │   └── index.ts        # 查词编排：缓存→ECDICT→联网
│   │       ├── words/
│   │       │   ├── mastered.ts      # 已掌握单词列表
│   │       │   └── phrases.ts       # 按 lemma 存储词组（联网+手动）
│   │       ├── notes/
│   │       │   ├── notebooks.ts     # 笔记本与句子条目；含 base_sentence/base_phrases/not_found_words
│   │       │   ├── systemNotebooks.ts # 系统笔记本同步（词组总集、待补全词条）
│   │       │   ├── notebookUiSettings.ts # 笔记列表分页与每页条数偏好
│   │       │   ├── events.ts        # 笔记数据变更事件
│   │       │   └── bookNotebook.ts  # 每本书默认保存笔记本
│   │       ├── backup/
│   │       │   ├── types.ts           # 备份包 manifest 与结构
│   │       │   ├── collect.ts         # 汇总导出数据
│   │       │   ├── package.ts         # zip 打包/解包
│   │       │   ├── events.ts          # 导入后 UI 刷新事件
│   │       │   └── userDataBackup.ts  # 导入导出编排（写入用户目录）
│   │       ├── reading/
│   │       │   └── readingTime.ts     # 阅读时长累计、统计与备份合并
│   │       ├── tools/
│   │       │   └── bookWordFrequency.ts # 全书词频离线统计 → 词频笔记本
│   │       ├── llm/
│   │       │   ├── doubaoWordWorkflow.ts # 待补全词条豆包 prompt
│   │       │   ├── zhipuSettings.ts   # 智谱 API Key 本地存储
│   │       │   ├── zhipuClient.ts     # chat/completions 调用
│   │       │   └── deepAnalysis.ts    # 选段深度解析 → NotebookEntry
│   │       ├── epub/
│   │       │   ├── groups.ts        # 书架分组 CRUD
│   │       │   ├── parser.ts        # EPUB 解压、OPF/spine、插图 blob
│   │       │   ├── import.ts        # 浏览器/手机 EPUB 导入
│   │       │   ├── library.ts       # 书架书籍注册表（手机）
│   │       │   ├── progress.ts      # 阅读进度（chapterIndex + pageIndex）
│   │       │   ├── types.ts
│   │       │   └── index.ts
│   │       └── settings/
│   │           ├── readingSettings.ts # 字号/行距/主题/字体栈
│   │           ├── appShellTheme.ts    # 界面风格定义（木质/素纸/墨韵等）
│   │           ├── userSettings.ts    # 英语水平、行间翻译、界面风格
│   │           └── backupDirectory.ts   # 默认数据备份目录
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
        ├── KNOWN_ISSUES.md
        └── TEST_PLAN_2026-08-05.md  # 本轮反馈修复综合测试表
```

## 文件说明（按模块）

| 模块 | 路径 | 作用 |
|------|------|------|
| 书架首页 | `components/bookshelf/BookshelfScreen.tsx` | 木质书架、导入、打开书籍 |
| 阅读器 | `components/reader/ReaderScreen.tsx` | 阅读页（由书架进入） |
| 控制面板 | `components/reader/ReaderControlPanel.tsx` | 退出、目录、设置入口 |
| 目录 | `components/reader/TocPanel.tsx` | 章节列表跳转 |
| 阅读设置 | `components/reader/ReadingSettingsPanel.tsx` | 字号、行距、字体、背景、信源状态 |
| 行间翻译 | `components/reader/useInlineGlosses.ts` | 当前页可见词查词并生成释义 |
| 点词弹窗 | `components/reader/WordDetailPopup.tsx` | 释义、发音、变体、已掌握、本书出现次数 |
| 逐词渲染 | `components/reader/ChapterContent.tsx` | 不用 iframe，单词可点击，支持行间释义 |
| 已掌握词 | `services/words/mastered.ts` | 隐藏行间翻译的单词列表 |
| EPUB 解析 | `services/epub/parser.ts` | jszip + OPF/spine + 插图 |
| 书架 | `services/epub/library.ts` | 已导入书籍元数据 |
| 阅读进度 | `services/epub/progress.ts` | chapterIndex + pageIndex |
| 阅读设置存储 | `services/settings/readingSettings.ts` | Preferences / localStorage |
| 用户设置 | `services/settings/userSettings.ts` | 英语水平、行间翻译词性/释义数、字号颜色偏移 |
| 词典 | `services/dictionary/` | ECDICT 本地 + 联网查词 + 缓存 + 发音 |

## 计划中（尚未创建）

| 路径 | 用途 |
|------|------|
| `components/reader/InlineTranslation.tsx` | 行间注释 |
| `components/bookshelf/` | 分组、换肤完整版 |
| `services/notes/` | 笔记与划线 |
