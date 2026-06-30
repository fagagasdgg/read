# GitHub 云端打包 APK（无需本机 Android Studio）

把代码推到 GitHub 后，由 **GitHub Actions** 在云端自动编译 APK。  
你只需下载产物，传到手机安装即可。

---

## 一、一次性准备

### 1. 在 GitHub 创建空仓库

1. 打开 https://github.com/new
2. 仓库名例如：`read`（随意）
3. 选 **Private** 或 Public
4. **不要**勾选 README / .gitignore（本地已有）
5. 创建仓库，记下地址，例如：  
   `https://github.com/你的用户名/read.git`

### 2. 本地初始化并推送（只需做一次）

在项目根目录 `read/` 打开终端（PowerShell 或 cmd）：

```powershell
cd C:\Users\v_dcganluo\Desktop\文件\code\read

git init
git add .
git commit -m "初始提交：英语 EPUB 阅读器"
git branch -M main
git remote add origin https://github.com/你的用户名/read.git
git push -u origin main
```

> 第一次 `git push` 会要求登录 GitHub（浏览器或 Personal Access Token）。

---

## 二、触发打包

推送代码后，工作流 **Build Android APK** 会自动运行。

也可手动触发：

1. 打开 GitHub 仓库页面
2. 点 **Actions**
3. 左侧选 **Build Android APK**
4. 点 **Run workflow** → **Run workflow**

---

## 三、下载 APK 装到手机

1. 进入该次运行的详情页（绿色勾或黄色圈）
2. 滚到下方 **Artifacts**
3. 下载 **Read-debug-apk**（zip 里就是 `app-debug.apk`）
4. 传到手机安装（需允许「安装未知来源应用」）

或用数据线 + adb（可选）：

```powershell
adb install app-debug.apk
```

---

## 四、以后每次改完代码

```powershell
cd C:\Users\v_dcganluo\Desktop\文件\code\read
git add .
git commit -m "描述你的修改"
git push
```

推送后 Actions 会自动重新打包，再去 Artifacts 下载新 APK。

---

## 五、说明

| 项目 | 说明 |
|------|------|
| 工作流文件 | `.github/workflows/build-apk.yml` |
| 产物类型 | Debug APK（测试用，未签名发布版） |
| 保留时间 | Artifacts 默认保留 30 天 |
| 本机需要 | Git + GitHub 账号；**不需要** Android Studio |
| 私有仓库 | Actions 免费额度：私有库每月约 2000 分钟（一般够用） |

---

## 六、打包失败怎么办

1. 打开 Actions 里失败的那次运行
2. 点开红色的 **Build Debug APK** 或失败步骤
3. 把错误日志最后几十行复制发给我

常见原因：SDK 版本变更、依赖安装失败——我可以帮你改工作流。
