# 技术选型与架构说明

> 项目：奶油日记（Cream Diary）
> 版本：v1.0
> 日期：2026-06-19

---

## 1. 技术选型

| 技术 | 选择 | 理由 |
|------|------|------|
| 前端框架 | **原生 HTML/CSS/JS**（无框架） | 零依赖、体积小、加载快、无需构建工具 |
| 图表库 | **Chart.js 4.x**（CDN 引入） | 轻量、文档好、折线图开箱即用 |
| 数据存储 | **IndexedDB**（浏览器原生） | 支持大容量结构化数据、支持索引搜索 |
| 离线方案 | **Service Worker** | PWA 标配，支持离线访问和缓存 |
| 推送通知 | **Web Notification API** | 浏览器原生，无需第三方 |
| PWA 配置 | **manifest.json** | 添加到主屏幕、全屏模式、图标定义 |
| 图标 | **Emoji + 纯 CSS** 实现 | 避免额外图片资源，加载零成本 |

### 1.1 为什么不用框架？
- 项目功能聚焦、交互不复杂
- 减少依赖、降低维护成本
- 页面加载速度最快
- 非技术人员后续修改配置也容易

### 1.2 外部 CDN 依赖

| 资源 | URL | 用途 |
|------|-----|------|
| Chart.js 4.4.x | `https://cdn.jsdelivr.net/npm/chart.js` | 情绪趋势折线图 |

> 注：所有 CDN 资源在 Service Worker 中列入预缓存列表，首次加载后即可离线使用。

---

## 2. 系统架构

```
┌─────────────────────────────────────┐
│           index.html                │
│  ┌───────────┐  ┌────────────────┐  │
│  │ 导航栏 Tab │  │  页面容器      │  │
│  │ 🏠📅📊🔍⚙️ │  │  (5个Panel)    │  │
│  └───────────┘  └────────────────┘  │
└─────────────────────────────────────┘
          │               │
    ┌─────┴──────┐  ┌────┴──────────────────┐
    │  CSS 层    │  │     JavaScript 层       │
    │ style.css  │  │  ┌──────────────────┐  │
    │ (奶油主题) │  │  │ app.js (主控)    │  │
    └────────────┘  │  ├──────────────────┤  │
                    │  │ storage.js (数据)│  │
                    │  ├──────────────────┤  │
                    │  │ chart.js (图表)  │  │
                    │  ├──────────────────┤  │
                    │  │ search.js (搜索) │  │
                    │  ├──────────────────┤  │
                    │  │ tags.js (标签)   │  │
                    │  └──────────────────┘  │
                    └────────────────────────┘
          │
    ┌─────┴──────┐
    │  IndexedDB  │
    │  cream-diary│
    │  ├─ records │  (情绪记录)
    │  ├─ tags    │  (自定义标签)
    │  └─ settings│  (用户设置)
    └────────────┘
```

---

## 3. 数据模型

### 3.1 records 表（情绪记录）

```javascript
{
  id: "uuid",            // 唯一标识
  date: "2026-06-19",    // 日期 YYYY-MM-DD
  score: 7.5,            // 情绪分数 1.0-10.0
  tags: ["开心", "期待"], // 标签数组
  q1: "今天发生了什么？",  // 第1问 - 内容
  a1: "和朋友吃了火锅...", // 第1问 - 回答
  q2: "最明显的感受？",    // 第2问 - 内容
  a2: "非常满足和温暖",    // 第2问 - 回答
  q3: "反映什么需求？",    // 第3问 - 内容
  a3: "我需要社交连接...", // 第3问 - 回答
  createdAt: "ISO8601",   // 创建时间戳
  updatedAt: "ISO8601"    // 更新时间戳
}
```

### 3.2 tags 表（自定义标签）

```javascript
{
  id: "uuid",
  name: "实习压力",       // 标签名
  color: "#E8D5B7",       // 标签颜色
  isPreset: false,        // 是否为预设标签
  createdAt: "ISO8601"
}
```

### 3.3 settings 表（用户设置）

```javascript
{
  key: "reminderTime",    // 设置键
  value: "21:00"          // 设置值
}
// 其他设置: reminderEnabled (bool), theme (string)
```

---

## 4. IndexedDB 索引设计

| 表 | 索引字段 | 用途 |
|----|----------|------|
| records | `date` | 按日期查询/排序 |
| records | `score` | 按分数范围筛选 |
| records | `tags` | 按标签筛选（multiEntry） |
| tags | `name` | 标签名唯一性检查 |

---

## 5. 安全与隐私

| 措施 | 说明 |
|------|------|
| 全本地存储 | IndexedDB 数据仅在浏览器沙箱内，不联网传输 |
| 无第三方追踪 | 不使用任何分析/统计 SDK |
| HTTPS 部署 | PWA 要求 HTTPS，确保传输安全（GitHub Pages 默认支持） |
| JSON 导出加密 | v1.0 暂不加密；v1.1 计划加密码保护导出文件 |

---

## 6. 浏览器兼容性

| 特性 | Safari iOS | Chrome Android |
|------|-----------|----------------|
| IndexedDB | ✅ 完全支持 | ✅ 完全支持 |
| Service Worker | ✅ iOS 11.3+ | ✅ 完全支持 |
| Web Notification | ✅ iOS 16.4+ | ✅ 完全支持 |
| PWA manifest | ✅ iOS 12.2+ | ✅ 完全支持 |
| Chart.js Canvas | ✅ 完全支持 | ✅ 完全支持 |

> **目标 iOS 版本：iOS 16.4+**（确保通知功能可用）

---

## 7. 部署方案

| 阶段 | 平台 | 说明 |
|------|------|------|
| 开发测试 | 本地 `npx serve` | 用本地静态服务器测试 |
| 上线 | **GitHub Pages** | 免费、HTTPS、自定义域名可选 |
| 访问 | `https://你的用户名.github.io/cream-diary` | 手机 Safari 打开 → 添加到主屏幕 |

---

## 8. 文件结构（最终）

```
cream-diary/
├── README.md                 # 项目总指引
├── index.html                # 单页应用入口
├── manifest.json             # PWA 清单
├── sw.js                     # Service Worker
├── docs/
│   ├── requirements.md       # 需求规格说明书
│   ├── technical-spec.md     # 本文件 - 技术规范
│   ├── design-guide.md       # UI 设计规范
│   └── dev-plan.md           # 开发计划与里程碑
├── dev-log/
│   ├── _TEMPLATE.md          # 日志模板
│   └── 2026-06-19.md         # 每日开发日志
├── css/
│   └── style.css             # 全局样式
├── js/
│   ├── app.js                # 主控 & 页面切换
│   ├── storage.js            # IndexedDB 操作封装
│   ├── chart.js              # 情绪趋势图（注意：非 Chart.js 库本身）
│   ├── search.js             # 搜索筛选逻辑
│   ├── notify.js             # 通知提醒
│   └── tags.js               # 标签管理
└── assets/
    └── icons/                # PWA 图标（后续生成）
        ├── icon-192.png
        └── icon-512.png
```

> **注意**：`js/chart.js` 是我们自己的图表逻辑代码，不是 Chart.js 库。Chart.js 库通过 CDN 在 HTML 中引入。