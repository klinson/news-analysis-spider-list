# GlobalWatch 列表爬虫 (List Crawler)

基于 GitHub Actions + Puppeteer 的列表页采集服务,负责发现新闻文章 URL。

## 🎯 功能定位

- ✅ 渲染动态页面(Puppeteer)
- ✅ 解析列表页,提取文章基本信息
- ✅ 支持多种翻页方式(点击、滚动、URL 参数)
- ✅ 自动发现规则(上报 HTML)
- ✅ 批量提交到服务端队列

## 📁 目录结构

```
list/
├── .github/
│   └── workflows/
│       └── list-crawler.yml    # GitHub Actions 配置
├── src/
│   ├── config.js              # 配置管理
│   ├── api-client.js          # API 客户端
│   ├── crawler.js             # 爬虫核心逻辑
│   └── utils.js               # 工具函数
├── main.js                    # 主入口
├── package.json               # Node.js 依赖
├── .env.example              # 环境变量示例
├── .gitignore                # Git 忽略文件
├── README.md                 # 本文档
├── DEPLOYMENT.md             # 部署指南
└── LICENSE                   # MIT 许可证
```

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件:

```env
API_BASE_URL=https://your-domain.com/api
API_TOKEN=your-api-token-here
LOG_LEVEL=info
```

### 3. 本地运行

```bash
node main.js
```

## ⚙️ 配置说明

### 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `API_BASE_URL` | 服务端 API 地址 | `http://localhost/api` |
| `API_TOKEN` | API 认证令牌 | 无 |
| `LOG_LEVEL` | 日志级别 | `info` |
| `HEADLESS` | 无头模式 | `true` |
| `MAX_PAGES` | 最大翻页数 | `5` |

### 渠道规则配置

规则存储在服务端,通过 API 获取:

```json
{
  "channel_id": 1,
  "entry_url": "https://example.com/news",
  "crawl_config": {
    "list_item_xpath": "//div[@class='article-item']",
    "title_xpath": ".//h2[@class='title']/text()",
    "url_xpath": ".//a[@class='link']/@href",
    "summary_xpath": ".//p[@class='summary']/text()",
    "time_xpath": ".//span[@class='time']/text()",
    "image_xpath": ".//img/@src"
  },
  "pagination_config": {
    "pagination_type": "click",
    "pagination_xpath": "//button[@class='next-page']"
  },
  "max_pages": 3
}
```

## 📊 采集流程

```
1. 从服务端获取启用的渠道列表
   ↓
2. 遍历每个渠道
   ├─ 有规则 → 按规则爬取
   └─ 无规则 → 上报 HTML,等待配置
   ↓
3. 使用 Puppeteer 打开页面
   ↓
4. 按 XPath 规则提取列表项
   ↓
5. 处理翻页(点击/滚动/URL)
   ↓
6. 批量提交文章基本信息到服务端
```

## 🔧 翻页策略

### 点击翻页

```json
{
  "pagination_type": "click",
  "pagination_xpath": "//button[@class='next']"
}
```

### 滚动翻页

```json
{
  "pagination_type": "scroll",
  "scroll_distance": 1000
}
```

### URL 参数翻页

```json
{
  "pagination_type": "url",
  "url_pattern": "https://example.com/news?page={page}"
}
```

## 🤖 GitHub Actions 部署

### 配置 Secrets

在仓库设置中添加:
- `API_BASE_URL`
- `API_TOKEN`

### 定时运行

默认每小时运行一次,可在 `.github/workflows/list-crawler.yml` 中修改。

## 📝 API 接口

### 获取渠道列表

```http
GET /api/channels/enabled
Authorization: Bearer {token}
```

### 获取渠道规则

```http
GET /api/channels/{id}/rule
Authorization: Bearer {token}
```

### 上报 HTML

```http
POST /api/channels/{id}/html
Authorization: Bearer {token}
Content-Type: application/json

{
  "html": "<html>...</html>",
  "url": "https://example.com/news"
}
```

### 批量提交文章

```http
POST /api/articles/batch
Authorization: Bearer {token}
Content-Type: application/json

{
  "items": [
    {
      "channel_id": 1,
      "title": "文章标题",
      "url": "https://example.com/article/1",
      "summary": "摘要",
      "published_at": "2024-03-06T10:00:00Z",
      "cover_image": "https://example.com/image.jpg"
    }
  ]
}
```

## 🐛 故障排查

### Puppeteer 安装失败

```bash
# 使用国内镜像
npm config set puppeteer_download_host=https://npmmirror.com/mirrors
npm install
```

### 页面加载超时

增加超时时间:

```javascript
await page.goto(url, { 
  waitUntil: 'networkidle2', 
  timeout: 60000 
});
```

### XPath 未匹配到元素

检查规则是否正确,或页面结构是否变化。

## 📄 许可证

MIT License

---

**版本:** v1.0.0  
**更新日期:** 2024-03-06
