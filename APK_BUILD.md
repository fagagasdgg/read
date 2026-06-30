# 手机 APK 打包与真机测试指南

> 目标：在 Android 手机上安装 Read 应用，测试 EPUB 导入、阅读、点词查义。

---

## 一、安装必备软件（按顺序）

### 1. JDK 17

**方式 A：winget（推荐）**

```powershell
winget install EclipseAdoptium.Temurin.17.JDK
```

安装完成后 **关闭并重新打开** 终端，验证：

```powershell
java -version
```

应显示 `openjdk version "17.x.x"`。

**方式 B：手动下载**

打开 https://adoptium.net/temurin/releases/?version=17  
下载 Windows x64 **.msi**，一路下一步安装。

---

### 2. Android Studio

**方式 A：winget**

```powershell
winget install Google.AndroidStudio
```

**方式 B：手动下载**

https://developer.android.com/studio

安装时勾选：
- Android SDK
- Android SDK Platform
- Android Virtual Device（可选，真机可不要）

---

### 3. 首次打开 Android Studio 配置 SDK

1. 打开 Android Studio
2. 首次向导选 **Standard** 安装
3. 进入后：**More Actions → SDK Manager**
4. **SDK Platforms** 标签：勾选 **Android 14 (API 34)** 或更高
5. **SDK Tools** 标签：确认已装
   - Android SDK Build-Tools
   - Android SDK Platform-Tools
   - Android Emulator（可选）
6. 点 **Apply** 下载

默认 SDK 路径：`C:\Users\你的用户名\AppData\Local\Android\Sdk`

---

### 4. 配置环境变量（PowerShell）

把 `JAVA_HOME` 路径改成你机器上实际的 JDK 目录（可在 `C:\Program Files\Eclipse Adoptium\` 下找）：

```powershell
[Environment]::SetEnvironmentVariable("JAVA_HOME", "C:\Program Files\Eclipse Adoptium\jdk-17.0.15.6-hotspot", "User")
[Environment]::SetEnvironmentVariable("ANDROID_HOME", "$env:LOCALAPPDATA\Android\Sdk", "User")
$oldPath = [Environment]::GetEnvironmentVariable("Path", "User")
[Environment]::SetEnvironmentVariable("Path", "$oldPath;$env:LOCALAPPDATA\Android\Sdk\platform-tools", "User")
```

**重新打开终端** 后验证：

```powershell
java -version
adb version
```

---

## 二、手机开启 USB 调试

1. 手机 **设置 → 关于手机**，连续点 **版本号** 7 次，开启开发者模式
2. **设置 → 开发者选项**，打开 **USB 调试**
3. 用数据线连接电脑，手机上点 **允许调试**

验证：

```powershell
adb devices
```

应看到你的设备（状态 `device`）。

---

## 三、构建并安装到手机

在项目目录执行（PowerShell 用 `npm.cmd`）：

```powershell
cd C:\Users\v_dcganluo\Desktop\文件\code\read\app
npm.cmd run cap:sync
npm.cmd run cap:open:android
```

Android Studio 打开后：

1. 等待右下角 **Gradle Sync** 完成（首次可能 5～15 分钟）
2. 顶部设备下拉框选你的 **真机**
3. 点击绿色 **Run ▶** 按钮

应用会自动编译并安装到手机。

### 只打 APK 文件（不通过 Run）

Android Studio 菜单：

**Build → Build Bundle(s) / APK(s) → Build APK(s)**

完成后 APK 在：

```
app\android\app\build\outputs\apk\debug\app-debug.apk
```

可复制到手机安装，或用 `adb install app-debug.apk`。

---

## 四、命令行一键打 Debug APK（环境配好后）

```powershell
cd app\android
.\gradlew.bat assembleDebug
```

APK 输出路径同上。

---

## 五、手机上怎么测试

1. 打开 **Read** 应用
2. 切到 **阅读器** Tab
3. 点 **从手机选择 EPUB** → 在文件管理器里选一本英文 EPUB
4. **点击正文单词** → 应弹出中文释义（走有道 API + 本地缓存）
5. 用底部 **上一页 / 下一页** 翻章
6. 关掉 App 再打开 → 点 **继续阅读上次的书籍**

---

## 六、常见问题

| 问题 | 处理 |
|------|------|
| PowerShell 禁止运行 npm | 用 `npm.cmd` 代替 `npm` |
| `java` 找不到 | 装 JDK 17 并配置 JAVA_HOME，重启终端 |
| Gradle 同步失败 | 确认 Android Studio SDK 已下载；检查网络/代理 |
| adb devices 为空 | 换数据线、重开 USB 调试、安装手机驱动 |
| 点词查词失败 | 确认手机能上网；词典在 APK 内走 CapacitorHttp，不经过电脑代理 |
| 选 EPUB 没反应 | 确认已 `npm.cmd run cap:sync` 同步了 file-picker 插件 |

---

## 七、开发与真机联调流程

每次改完代码：

```powershell
cd app
npm.cmd run cap:sync
```

然后在 Android Studio 再点 **Run ▶** 重装到手机。

浏览器 `npm.cmd run dev` 仍可用于快速调试 UI，但 **以手机 APK 测试结果为准**。
