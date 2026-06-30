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
│   │   ├── components/reader/
│   │   │   ├── ReaderScreen.tsx     # 阅读器主屏（导入 EPUB、翻页、点词）
│   │   │   ├── ChapterContent.tsx   # 章节 HTML 逐词渲染
│   │   │   ├── WordDetailPopup.tsx  # 点击单词弹出的释义浮窗
│   │   │   └── tokenize.ts          # 英文单词切分
│   │   │
│   │   ├── lib/
│   │   │   └── lemmatize.ts         # 词形还原
│   │   │
│   │   └── services/
│   │       ├── dictionary/          # 有道 API + IndexedDB 缓存
│   │       └── epub/
│   │           ├── parser.ts        # EPUB 解压、OPF/spine 解析
│   │           ├── import.ts          # 浏览器/手机 EPUB 导入与本地保存
│   │           ├── progress.ts        # 阅读章节进度
│   │           ├── types.ts
│   │           └── index.ts
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
| 阅读器 | `components/reader/ReaderScreen.tsx` | 选 EPUB、显示章节、底部翻页、点词查义 |
| 逐词渲染 | `components/reader/ChapterContent.tsx` | 不用 iframe，每个单词可点击 |
| EPUB 解析 | `services/epub/parser.ts` | jszip 解压 + OPF/spine |
| 阅读进度 | `services/epub/progress.ts` | 按书名记住当前章节（开发阶段用 localStorage） |
| 词典 | `services/dictionary/` | 联网查词 + 缓存 |
| 词典联调 | `pages/DictDebugPage.tsx` | 独立测试词典 API |

## 计划中（尚未创建）

| 路径 | 用途 |
|------|------|
| `components/bookshelf/` | 书架 UI |
| `components/reader/InlineTranslation.tsx` | 行间注释 |
| `services/books/` | 书籍元数据持久化 |
