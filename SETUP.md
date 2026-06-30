# 开发环境搭建指南

## 已就绪

| 工具 | 状态 |
|------|------|
| Node.js | v24.11.1 |
| npm | 11.6.2 |
| 项目代码 | `app/` 目录已初始化 |
| Capacitor Android 工程 | `app/android/` 已生成 |

## 尚未安装（打 APK 需要）

| 工具 | 状态 | 用途 |
|------|------|------|
| JDK 17 | 未安装 | Android 编译 |
| Android Studio | 未安装 | SDK、模拟器、打包 APK |

**手机真机测试完整步骤见：**

- **无 Android Studio（推荐）**：[GITHUB_BUILD.md](./GITHUB_BUILD.md) — 推送到 GitHub，云端自动打 APK
- **本机 Android Studio**：[APK_BUILD.md](./APK_BUILD.md)

---

## 第一步：浏览器开发（现在就能用）

```powershell
cd app
npm.cmd run dev
```

> **Windows 注意**：若 PowerShell 报错「禁止运行脚本」，请用 `npm.cmd` 代替 `npm`（如上），或在「命令提示符 cmd」里运行。  
> 若希望永久修复，可在 PowerShell（管理员）执行：  
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

浏览器打开终端里显示的地址（通常是 http://localhost:5173 ），可测试阅读器与词典联调：
- 输入单词 → 联网查有道免费接口
- 再次查询同一词 → 走 IndexedDB 本地缓存

---

## 第二步：安装 Android 打包环境

### 1. 安装 JDK 17

推荐 [Eclipse Temurin JDK 17](https://adoptium.net/temurin/releases/?version=17)（Windows x64 MSI）。

安装后验证：

```powershell
java -version
```

应显示 `17.x.x`。

### 2. 安装 Android Studio

下载：https://developer.android.com/studio

安装时勾选：
- Android SDK
- Android SDK Platform
- Android Virtual Device（模拟器，可选）

首次打开 Android Studio → **More Actions → SDK Manager**，确认已安装：
- Android SDK Platform 34 或更高
- Android SDK Build-Tools

### 3. 配置环境变量（PowerShell 用户级）

将路径替换成你本机 Android SDK 实际路径（默认 `%LOCALAPPDATA%\Android\Sdk`）：

```powershell
[Environment]::SetEnvironmentVariable("JAVA_HOME", "C:\Program Files\Eclipse Adoptium\jdk-17.x.x-hotspot", "User")
[Environment]::SetEnvironmentVariable("ANDROID_HOME", "$env:LOCALAPPDATA\Android\Sdk", "User")
[Environment]::SetEnvironmentVariable("Path", "$env:Path;$env:LOCALAPPDATA\Android\Sdk\platform-tools", "User")
```

重新打开终端后验证：

```powershell
adb version
```

---

## 第三步：同步并打开 Android 工程

```powershell
cd app
npm run cap:sync
npm run cap:open:android
```

Android Studio 打开后：
1. 等待 Gradle 同步完成
2. 连接真机（开启 USB 调试）或启动模拟器
3. 点击 Run ▶ 安装到设备

或在 Android Studio 菜单：**Build → Build Bundle(s) / APK(s) → Build APK(s)**

---

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 浏览器热更新开发 |
| `npm run build` | 构建 Web 产物到 `dist/` |
| `npm run cap:sync` | 构建并同步到 Android |
| `npm run cap:open:android` | 用 Android Studio 打开 |

---

## 词典方案说明

- **在线源**：有道 `jsonapi_s` 免费接口（国内可用，中文释义、音标、考试等级、词形变体）
- **缓存**：IndexedDB（浏览器）/ 后续 APK 可迁到 SQLite
- **词形还原**：`compromise` + 少量不规则动词表（told → tell）

无需申请 API Key，适合个人阅读器场景。注意：请勿高频批量爬取，正常使用查词即可。
