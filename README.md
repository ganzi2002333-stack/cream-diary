# 🍰 奶油日记 · Cream Diary

> 一款运行在 iPhone 上的可爱情绪记录 PWA 应用
> 
> 记录每天的情绪，用标签和反思，看见自己。

---

## 📌 项目概述

**奶油日记**帮助你每天花 3 分钟记录情绪状态：滑动打分、选择标签、回答三个小问题。支持情绪趋势图表、关键词搜索、每日提醒，数据完全保存在你的手机上，隐私安全。

---

## 🗺️ 文档导航

| 文档 | 路径 | 说明 |
|------|------|------|
| 📋 需求规格说明书 | [`docs/requirements.md`](docs/requirements.md) | 产品功能、非功能需求、UI方向 |
| 🔧 技术规范 | [`docs/technical-spec.md`](docs/technical-spec.md) | 技术选型、架构、数据模型、部署方案 |
| 🎨 UI 设计规范 | [`docs/design-guide.md`](docs/design-guide.md) | 色板、字体、圆角、间距、组件规范 |
| 📅 开发计划 | [`docs/dev-plan.md`](docs/dev-plan.md) | 8 阶段开发路线图与里程碑 |
| 📝 开发日志 | [`dev-log/`](dev-log/) | 每日开发记录 |

---

## 🚀 快速开始

### 本地开发
```bash
# 进入项目目录
cd cream-diary/src

# 启动本地静态服务器（需要 Node.js）
npx serve .

# 浏览器打开 http://localhost:3000
```

### 部署上线
项目设计为通过 **GitHub Pages** 部署（免费 HTTPS）：
1. 将 `cream-diary/src/` 推送到 GitHub 仓库
2. 在仓库 Settings → Pages 中启用
3. 用 iPhone Safari 打开链接 → 分享 → 添加到主屏幕

---

## 🏗️ 项目结构

```
cream-diary/
├── README.md                 ← 你在这里
├── docs/                     ← 项目文档
│   ├── requirements.md       # 需求规格说明书
│   ├── technical-spec.md     # 技术选型与架构
│   ├── design-guide.md       # UI 设计规范
│   └── dev-plan.md           # 开发计划
├── dev-log/                  ← 开发日志
│   ├── _TEMPLATE.md          # 日志模板
│   └── 2026-06-19.md         # 每日日志
└── src/                      ← 源代码（Phase 2+）
    ├── index.html            # 单页应用
    ├── manifest.json         # PWA 清单
    ├── sw.js                 # Service Worker
    ├── css/
    │   └── style.css         # 奶油色系样式
    ├── js/
    │   ├── app.js            # 主控逻辑
    │   ├── storage.js        # IndexedDB 操作
    │   ├── tags.js           # 标签管理
    │   ├── search.js         # 搜索筛选
    │   ├── chart.js          # 情绪趋势图
    │   └── notify.js         # 通知提醒
    └── assets/
        └── icons/            # PWA 图标
```

---

## 🎯 开发阶段

| 阶段 | 名称 | 状态 |
|------|------|------|
| Phase 1 | 🏗️ 项目地基 | ✅ 进行中 |
| Phase 2 | 🎨 UI 骨架 | ⬜ 待开始 |
| Phase 3 | 💾 数据层 | ⬜ 待开始 |
| Phase 4 | ❤️ 每日记录 | ⬜ 待开始 |
| Phase 5 | 📋 历史&搜索 | ⬜ 待开始 |
| Phase 6 | 📊 情绪趋势 | ⬜ 待开始 |
| Phase 7 | ⏰ 每日提醒 | ⬜ 待开始 |
| Phase 8 | ✨ 润色上线 | ⬜ 待开始 |

---

## 🛡️ 隐私说明

- ✅ 所有数据保存在手机浏览器 IndexedDB 中
- ✅ 不上传任何数据到服务器
- ✅ 支持 JSON 导出备份（可存到 iCloud Drive）
- ✅ 无需注册账号，无第三方追踪

---

## 📱 技术栈

- 纯 HTML/CSS/JS（零框架依赖）
- Chart.js（情绪趋势折线图）
- IndexedDB（本地数据存储）
- Service Worker + manifest.json（PWA）
- Web Notification API（每日提醒）

---

> 💛 用温柔的方式，记录每一天。