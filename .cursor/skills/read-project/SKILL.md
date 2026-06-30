---
name: read-project
description: >-
  管理英语 EPUB 阅读器项目（read）。追踪架构、进度、Bug 及 xq/需求.md 变更。
  在本仓库开发、讨论功能、修 Bug 或用户更新需求文档时使用。
---

# 英语 EPUB 阅读器 — 项目 Skill

## 文档语言规范

**`.cursor/skills/read-project/` 下所有文档必须使用中文书写**（专有名词、代码路径、技术标识符除外）。

包括但不限于：PROGRESS.md、ARCHITECTURE.md、KNOWN_ISSUES.md、PROJECT_STRUCTURE.md、本 SKILL.md 正文。

更新上述任一文件时，保持中文；不得新增大段英文说明。

## 每次对话开始检查清单

本仓库每次新对话或新任务：

1. 读取 `xq/需求.md`（含 **§98 AI规范** 与 **§99 备注** 版本号）
2. 读取 [PROGRESS.md](PROGRESS.md) 了解当前进度
3. 读取 [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) 了解文件结构（§98.1）
4. 读取 [ARCHITECTURE.md](ARCHITECTURE.md) 了解技术决策
5. 修改阅读/笔记/进度相关代码前，读取 [KNOWN_ISSUES.md](KNOWN_ISSUES.md)
6. 若 `xq/需求.md` 有变更 → 执行下方「需求同步」

> **自动触发**：`.cursor/rules/read-project.mdc`（`alwaysApply: true`）每轮对话注入本清单。  
> **手动触发**：用户说「同步需求」「按 read-project 开始」或 `@read-project`。

## 需求同步

当 `xq/需求.md` 更新时：

1. 通读全文，记录 §99 备注中的版本
2. 与 [PROGRESS.md](PROGRESS.md) 功能清单对比
3. 新增项 → `待开始`；删除项 → `已取消` 并注明原因
4. 更新 PROGRESS.md **变更日志**
5. 有文件增删改名 → 更新 [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md)（§98.1）
6. 影响架构 → 更新 [ARCHITECTURE.md](ARCHITECTURE.md)

## 进度更新规则

完成开发后 **必须** 更新 PROGRESS.md：

| 状态 | 含义 |
|------|------|
| `待开始` | 尚未动手 |
| `进行中` | 正在开发或讨论 |
| `已完成` | 已实现并验证 |
| `阻塞` | 等待决策、依赖或 Bug 修复 |
| `已取消` | 需求已移除 |

同时：发现 Bug → 记入 KNOWN_ISSUES.md；架构决策 → 记入 ARCHITECTURE.md。

## 项目概要

- **产品**：英语 EPUB 阅读器（UI 参考掌阅安卓 App）
- **目标平台**：优先 APK
- **核心差异**：行间生词翻译 + 点击单词详情弹窗 + 词典缓存 + 笔记 + 已掌握开关
- **需求文档**：`xq/需求.md`（当前 v1，后续会持续扩充）

## 关键技术约束

1. **点词 vs 翻页**：翻页按钮在底部左右，不用屏幕左右半区点击
2. **阅读控制**：翻页按钮中间「房子」图标打开面板（只要目录+设置；不要亮度/夜间/章节进度条）
3. **禁止** 直接使用 epub.js iframe 渲染 — v1 有选区、进度、卡死问题（见 KNOWN_ISSUES.md）
4. **单词处理**：词形还原（TALK→talk，told→talk，弹窗显示原型并展示变体链接）
5. **持久化**：书架、分组、阅读进度、词典、笔记、已掌握词 — 重启后必须保留

## 实施阶段（概览）

详见 PROGRESS.md。大致顺序：

1. 脚手架 + EPUB 解析/渲染基础
2. 书架（导入、分组、皮肤、持久化）
3. 阅读器外壳（布局、底部导航、控制面板）
4. 行间翻译引擎
5. 单词详情弹窗 + 词典 API + 本地缓存
6. 笔记与划线（规避 v1 Bug）
7. 主设置（等级、翻译显示、JSON 导出）
8. 打磨 + APK 打包

## 参考截图

均在 `xq/` 目录。实现 UI 时读取对应图片：

| 文件 | 用途 |
|------|------|
| `0cbb5de6ecc2c16563584d5f9d77d7e8_origin(1).jpg` | 书架默认皮肤 |
| `fa1381adc8751e2c827013ae28c2c076_compress.jpg` | 目录 |
| `64cb24c4c3534cc282560521e561e63f_compress.jpg` | 阅读控制面板 |
| `fe2807a3588bcd76264714cbb0488ad4_compress.jpg` | 阅读设置 |
| `e62ce92b5ac9c5cde3b60038aa0b72d9_compress.jpg` | 阅读页布局 |
| `8e03bd352df38dd7212c97aaaa5e6fc0_compress.jpg` | 行间注释 |
| `0f52afc745c66fb134eb67763c37c480_compress.jpg` | 单词详情弹窗 |
| `e7c16ec74c6f355a4ac6f2ee3d24a97a_compress.jpg` | 须规避的选区问题 |
| `2026-06-30-10-51-52.png` | 单词查询联调页面 |

## 相关文档

- 功能进度：[PROGRESS.md](PROGRESS.md)
- 项目结构：[PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md)
- 技术架构：[ARCHITECTURE.md](ARCHITECTURE.md)
- 已知问题：[KNOWN_ISSUES.md](KNOWN_ISSUES.md)
- 自动守则：`.cursor/rules/read-project.mdc`
