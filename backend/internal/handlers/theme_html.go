package handlers

import (
	"onenav/internal/models"
	"onenav/internal/response"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
)

const htmlThemePrefix = "html:"
const systemThemeKey = "system"

func isLegacyBuiltinTheme(key string) bool {
	switch key {
	case "glass", "default", "dark", "card":
		return true
	default:
		return false
	}
}

func isSystemThemeKey(theme string) bool {
	return theme == systemThemeKey || isLegacyBuiltinTheme(theme) || theme == ""
}

func isBuiltinTheme(key string) bool {
	return isSystemThemeKey(key)
}

func normalizeThemeKey(theme string) string {
	if isHtmlThemeKey(theme) {
		return theme
	}
	if isSystemThemeKey(theme) {
		return systemThemeKey
	}
	return theme
}

func isHtmlThemeKey(theme string) bool {
	return strings.HasPrefix(theme, htmlThemePrefix)
}

func htmlThemeFSKey(theme string) string {
	return strings.TrimPrefix(theme, htmlThemePrefix)
}

func (h *Handler) themesRoot() string {
	return filepath.Join(h.Cfg.DataDir, "themes")
}

func (h *Handler) htmlThemeIndexPath(fsKey string) string {
	return filepath.Join(h.themesRoot(), fsKey, "index.html")
}

func (h *Handler) htmlThemePreviewURL(fsKey string) string {
	return "/themes/" + fsKey + "/index.html"
}

func (h *Handler) currentThemeKey() string {
	var s models.Setting
	if err := h.DB.First(&s).Error; err != nil || s.Theme == "" {
		return systemThemeKey
	}
	return normalizeThemeKey(s.Theme)
}

func (h *Handler) frontendURLForTheme(theme string) string {
	if isHtmlThemeKey(theme) {
		return h.htmlThemePreviewURL(htmlThemeFSKey(theme))
	}
	return "/"
}

func systemThemeItem() gin.H {
	return gin.H{
		"key":         systemThemeKey,
		"name":        "系统默认",
		"description": "内置 React 前台，支持外观调色；不可删除，删除其它主题时会回退到此项",
		"type":        "system",
		"locked":      true,
		"preview_url": "/",
	}
}

func (h *Handler) listCustomThemes() []gin.H {
	var rows []models.HtmlTheme
	_ = h.DB.Order("id desc").Find(&rows).Error
	out := make([]gin.H, 0, len(rows))
	for _, row := range rows {
		out = append(out, gin.H{
			"key":         htmlThemePrefix + row.Key,
			"name":        row.Name,
			"description": row.Description,
			"type":        "html",
			"locked":      false,
			"fs_key":      row.Key,
			"preview_url": h.htmlThemePreviewURL(row.Key),
			"created_at":  row.CreatedAt,
		})
	}
	return out
}

func (h *Handler) ensureSetting() (models.Setting, error) {
	var s models.Setting
	if err := h.DB.First(&s).Error; err != nil {
		s = defaultSetting()
		if err := h.DB.Create(&s).Error; err != nil {
			return s, err
		}
	}
	wasLegacy := isLegacyFactoryAppearance(&s)
	normalizeAppearance(&s)
	// 旧内置预设统一迁移为 system
	themeChanged := false
	if isLegacyBuiltinTheme(s.Theme) || s.Theme == "" {
		s.Theme = systemThemeKey
		themeChanged = true
	}
	if wasLegacy || themeChanged {
		_ = h.DB.Save(&s).Error
	}
	return s, nil
}

func (h *Handler) DeleteHtmlTheme(c *gin.Context) {
	raw := c.Param("key")
	fsKey := htmlThemeFSKey(raw)
	if fsKey == "" || fsKey == systemThemeKey || isLegacyBuiltinTheme(fsKey) {
		response.BadRequest(c, "系统默认主题不可删除")
		return
	}

	var row models.HtmlTheme
	if err := h.DB.Where("`key` = ?", fsKey).First(&row).Error; err != nil {
		response.BadRequest(c, "主题不存在")
		return
	}

	themeKey := htmlThemePrefix + fsKey
	if err := h.DB.Delete(&row).Error; err != nil {
		response.ServerError(c, "删除失败")
		return
	}
	_ = os.RemoveAll(filepath.Join(h.themesRoot(), fsKey))

	// 若当前正在使用，回退到系统默认
	var s models.Setting
	if err := h.DB.First(&s).Error; err == nil && s.Theme == themeKey {
		s.Theme = systemThemeKey
		_ = h.DB.Save(&s).Error
	}

	response.OK(c, gin.H{"deleted": themeKey, "current": systemThemeKey})
}

func (h *Handler) ThemeGuide(c *gin.Context) {
	response.OK(c, gin.H{
		"title":    "HTML 主题开发说明",
		"markdown": themeAuthorGuideMarkdown(),
	})
}

// ServeFrontend 生产环境根路径：启用 HTML 主题时直接返回上传的 index.html
func (h *Handler) ServeFrontend(c *gin.Context) {
	theme := h.currentThemeKey()
	if isHtmlThemeKey(theme) {
		path := h.htmlThemeIndexPath(htmlThemeFSKey(theme))
		if st, err := os.Stat(path); err == nil && !st.IsDir() {
			c.File(path)
			return
		}
	}
	index := filepath.Join(h.Cfg.StaticDir, "index.html")
	if st, err := os.Stat(index); err == nil && !st.IsDir() {
		c.File(index)
		return
	}
	c.String(404, "frontend not available")
}

func themeAuthorGuideMarkdown() string {
	return `# OneNav HTML 主题开发说明

把这份说明发给 AI，即可按公开 API 生成单文件 ` + "`index.html`" + `，或拆分 CSS/JS 后打成 ZIP，再在后台「主题列表」上传并启用。

> **重要**：优先复制带「重要」标记的段落给 AI；文末「最小拉取示例」仅供参考，不必复制。

## 目标

生成可独立运行的前台页面（单文件内联，或 ` + "`index.html` + `css/` + `js/`" + `），通过调用 OneNav 公开接口渲染导航分类与链接。

## 基础约定

- 主题与后台同域部署，请求使用相对路径即可（如 ` + "`/api/public/settings`" + `、` + "`/api/public/categories`" + `）。
- 所有接口统一响应结构：

` + "```json" + `
{
  "code": 0,
  "message": "ok",
  "data": {}
}
` + "```" + `

- ` + "`code === 0`" + ` 表示成功；失败时 ` + "`data`" + ` 多为 null，请读 ` + "`message`" + `。
- 未登录时，私有分类/链接不会返回；若浏览器已登录后台（Cookie ` + "`onenav_token`" + `），则可以看到私有数据。

## 主要接口

> **重要**：新主题请分别调用两个接口——` + "`/api/public/settings`" + `（站点设置）与 ` + "`/api/public/categories`" + `（分类+链接）。` + "`/api/public/nav`" + ` 为旧版合并接口，仅作兼容。

### 1) 获取站点设置（前台页面配置）

- Method: ` + "`GET`" + `
- URL: ` + "`/api/public/settings`" + `
- Auth: 可选
- 用途：网站标题、LOGO、副标题、背景图、搜索开关、外观色值等（对应后台「站点设置」及主题外观字段）

成功时 ` + "`data`" + ` 即为设置对象：

` + "```json" + `
{
  "site_title": "OneNav",
  "site_logo": "/uploads/xxx.png",
  "site_subtitle": "简洁好用的个人导航",
  "site_keywords": "",
  "site_description": "",
  "custom_header": "",
  "custom_footer": "",
  "search_enabled": true,
  "search_default": "baidu",
  "search_engines": "baidu,google,bing",
  "theme": "system",
  "primary_color": "#3B82F6",
  "accent_color": "#60A5FA",
  "bg_color": "#EEF3F9",
  "bg_color_end": "#F8FAFC",
  "text_color": "#0F172A",
  "muted_color": "#64748B",
  "bg_image": "",
  "bg_image_mode": "none",
  "glass_opacity": 58,
  "glass_blur": 22,
  "glass_saturate": 160,
  "header_opacity": 70
}
` + "```" + `

字段说明：

- ` + "`site_title` / `site_logo` / `site_subtitle`" + `：站点基础信息。
  - ` + "`site_title`" + `：同时用于页面 ` + "`<title>`" + ` / ` + "`document.title`" + `（浏览器标签文字）。
  - ` + "`site_logo`" + `：前台页头 LOGO；**若有值，必须同步为浏览器标签图标（favicon）**，与系统默认前台行为一致（见下文「标题与 favicon」）。
- ` + "`bg_image`" + `：**前台背景图 URL**（后台「站点设置」配置）。
  - ` + "`bg_image_mode=none`" + `：无图，仅用渐变色。
  - ` + "`bg_image_mode=custom`" + `：自定义上传或外链，` + "`bg_image`" + ` 多为 ` + "`/uploads/xxx.jpg`" + ` 或 ` + "`https://...`" + `。
  - ` + "`bg_image_mode=bing`" + `：Bing 每日壁纸；公开接口会把 ` + "`bg_image`" + ` 解析为同源代理 ` + "`/api/public/bing-bg`" + `（主题直接当图片 URL 用即可）。
- ` + "`bg_image_mode`" + `：` + "`none` | `custom` | `bing`" + `（后台可切换）。
- ` + "`search_enabled` / `search_default` / `search_engines`" + `：前台搜索相关（兼容旧字段）。
- ` + "`search_engine_list`" + `：完整搜索引擎列表（推荐使用）。公开接口 ` + "`/api/public/settings`" + ` 与 ` + "`/api/public/nav`" + ` 会注入该数组，元素含 ` + "`id` / `name` / `group` / `url`" + `（` + "`url`" + ` 内用 ` + "`{q}`" + ` 占位关键词）。自定义主题优先读此字段渲染引擎切换。
- ` + "`primary_color` / `accent_color` / `bg_color` / `bg_color_end` / `text_color` / `muted_color`" + `：站点外观色（后台「主题 → 站点外观调色」）。
- ` + "`glass_opacity` / `header_opacity` / `glass_blur` / `glass_saturate`" + `：玻璃质感参数（0–100 或 px/%，见下文）。
- **自定义 HTML 主题必须读取并应用上述外观字段**，这样管理员在后台调色后无需改主题代码。

### 2) 获取分类与链接

- Method: ` + "`GET`" + `
- URL: ` + "`/api/public/categories`" + `
- Auth: 可选（Cookie / Authorization Bearer；登录后可见私有分类/链接）
- 用途：导航分类树及每个分类下的链接列表

成功时 ` + "`data`" + ` 结构：

` + "```json" + `
{
  "authed": false,
  "nav": [
    {
      "id": 1,
      "name": "常用",
      "icon": "lucide:Star",
      "parent_id": null,
      "sort": 0,
      "private": false,
      "children": [],
      "links": [
        {
          "id": 1,
          "name": "GitHub",
          "url": "https://github.com",
          "backup_url": "",
          "icon": "lucide:Github",
          "icon_url": "",
          "description": "代码托管",
          "category_id": 1,
          "weight": 0,
          "private": false
        }
      ]
    }
  ]
}
` + "```" + `

字段说明：

- ` + "`nav`" + `：分类树。最多两层（顶级 + 子分类）。每个分类含 ` + "`children`" + ` 与直属 ` + "`links`" + `。
- ` + "`links[].url`" + `：主链接；` + "`backup_url`" + ` 可选备用。
- ` + "`icon`" + ` / ` + "`icon_url`" + `：后台图标字段。常见取值：
  - ` + "`lucide:Github`" + ` / ` + "`Github`" + `：Lucide 图标名（系统默认前台用 lucide-react；**HTML 主题必须用 Iconify 渲染，不能当纯文本**）
  - ` + "`/uploads/xxx.png`" + `：本站上传图片
  - ` + "`https://...`" + `：外链图片（多在 ` + "`icon_url`" + `）
  - emoji 短文本：可直接当文字显示
- ` + "`authed`" + `：当前请求是否已登录。**主题必须据此切换页脚「管理 / 登录」入口**（见「页脚管理入口」）。

### 推荐调用方式（给 AI）

` + "```js" + `
const [settingsRes, catsRes] = await Promise.all([
  fetch('/api/public/settings', { credentials: 'include' }).then((r) => r.json()),
  fetch('/api/public/categories', { credentials: 'include' }).then((r) => r.json()),
]);
if (settingsRes.code !== 0 || catsRes.code !== 0) throw new Error('load failed');
const settings = settingsRes.data;
const { nav, authed } = catsRes.data;
// 用 settings 渲染标题/LOGO/背景图；用 nav 渲染分类与链接
// 用 authed 渲染页脚「管理 / 登录」入口（必做）
` + "```" + `

### 3) 合并接口（兼容旧主题，可选）

- Method: ` + "`GET`" + `
- URL: ` + "`/api/public/nav`" + `
- Auth: 可选
- ` + "`data`" + `：` + "`{ settings, nav, authed }`" + `（一次返回上面两个接口的内容）
- 新主题无需再依赖此接口。

一般新主题只需调用 ` + "`/api/public/settings`" + ` + ` + "`/api/public/categories`" + `。

## 页面实现要求（给 AI）

> **必做**：生成页面必须读取并应用 ` + "`settings.bg_image`" + ` 与外观调色字段（` + "`primary_color`" + ` 等），兼容手机端 viewport，并在页脚提供「管理 / 登录」入口。

1. 单文件 ` + "`index.html`" + `，可内联 CSS/JS；不要依赖外部构建。
2. **必须兼容手机端**：
   - 加 ` + "`<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">`" + `
   - 布局用弹性/网格自适应；小屏下顶栏、搜索、链接卡片可单列；触控区域足够大；避免横向溢出
   - **ZIP 主题**可将 rem 换算 / flexible 等脚本放入 ` + "`js/`" + ` 或 ` + "`vendor/`" + `，在 ` + "`index.html`" + ` 中用相对路径引入（见「ZIP 主题包」）
3. 页面加载后分别请求（推荐并行）：
   - ` + "`GET /api/public/settings`" + ` → 标题 / LOGO / 背景图 / **外观调色** / 搜索配置
   - ` + "`GET /api/public/categories`" + ` → 分类树与链接（同时拿 ` + "`authed`" + `）
   - （可选兼容）` + "`GET /api/public/nav`" + ` 一次拿全部
   - 请求请带 ` + "`credentials: 'include'`" + `，以便 Cookie 登录态生效
4. **必须**调用下文 ` + "`applyAppearance(settings)`" + `（或等价逻辑），把色值映射到 CSS 变量，以便后台「站点外观调色」可控制本主题。
5. **必须**在拿到 settings 后调用 ` + "`applySiteBrand(settings)`" + `（或等价逻辑）：设置 ` + "`document.title`" + `，且当 ` + "`site_logo`" + ` 非空时写入 favicon（` + "`<link rel=\"icon\">`" + `），与页头 LOGO 使用同一地址。
6. **必须**在页面底部实现「管理 / 登录」入口（见下一节「页脚管理入口」），否则启用自定义主题后无法从首页进入后台。
7. 点击链接新窗口打开 ` + "`url`" + `；若主链为空则用 ` + "`backup_url`" + `；建议支持 Shift+点击打开备用链接。
8. 建议支持简单关键词过滤（按链接名、描述、URL）。
9. 若 ` + "`settings.search_enabled`" + ` 为 true，可按需实现站外搜索跳转（可选）。
10. **推荐**实现页头「日期时间 + 天气」模块（见后文），与系统默认前台体验对齐。
11. **图标（必做正确渲染）**：
   - ` + "`icon_url`" + ` 或 ` + "`icon`" + ` 以 ` + "`/`" + ` / ` + "`http`" + ` 开头 → ` + "`<img src>`" + `
   - ` + "`lucide:Xxx`" + ` 或 PascalCase 名（如 ` + "`Github`" + `）→ 用 Iconify：` + "`<iconify-icon icon=\"lucide:github\">`" + `（PascalCase 需转 kebab-case）
   - emoji → 文本节点
   - 不要把 ` + "`lucide:Github`" + ` 直接当 ` + "`textContent`" + `，否则会显示成一串字而不是图标
   - 页面需引入：` + "`<script src=\"https://code.iconify.design/iconify-icon/2.1.0/iconify-icon.min.js\"></script>`" + `
12. 不要写死跨域域名；始终用相对路径调用 API（含背景图 ` + "`/uploads/...`" + `）。
13. 上传后由 OneNav 托管在 ` + "`/themes/{id}/index.html`" + `；启用后也可作为站点首页。

## 标题与 favicon（给 AI，必做）

> **必做**：后台「站点设置」里的网站标题、网站 LOGO，除了画在页头外，还要反映到**浏览器标签**：
> - 标题 → ` + "`document.title`" + `
> - LOGO（有值时）→ ` + "`<link rel=\"icon\">`" + ` / ` + "`shortcut icon`" + ` / 建议同时设 ` + "`apple-touch-icon`" + `，` + "`href`" + ` 与 ` + "`settings.site_logo`" + ` **同一 URL**（多为 ` + "`/uploads/...`" + `）

推荐实现：

` + "```js" + `
function guessIconType(url) {
  const p = String(url || '').split('?')[0].toLowerCase();
  if (p.endsWith('.svg')) return 'image/svg+xml';
  if (p.endsWith('.png')) return 'image/png';
  if (p.endsWith('.jpg') || p.endsWith('.jpeg')) return 'image/jpeg';
  if (p.endsWith('.webp')) return 'image/webp';
  if (p.endsWith('.ico')) return 'image/x-icon';
  if (p.endsWith('.gif')) return 'image/gif';
  return '';
}
function upsertLink(rel, href, type) {
  let el = document.head.querySelector('link[rel=\"' + rel + '\"]');
  if (!el) {
    el = document.createElement('link');
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
  if (type) el.type = type;
  else el.removeAttribute('type');
}
function applySiteBrand(settings) {
  const s = settings || {};
  const title = String(s.site_title || '').trim() || '站点';
  document.title = title;
  const logo = String(s.site_logo || '').trim();
  if (!logo) return;
  const type = guessIconType(logo);
  upsertLink('icon', logo, type);
  upsertLink('shortcut icon', logo, type);
  upsertLink('apple-touch-icon', logo, '');
}
` + "```" + `

在拉取 settings 成功后立刻调用：` + "`applySiteBrand(settings)`" + `。

## 图标渲染（给 AI，必做）

> **重要 / 必做**：系统后台选的是 **Lucide** 图标，API 里多为 ` + "`lucide:Home`" + ` 或 ` + "`Home`" + `。自定义 HTML 主题没有 React，**必须用 Iconify Web Component 渲染**，否则图标会失效（显示成文字）。

### 引入

` + "```html" + `
<script src="https://code.iconify.design/iconify-icon/2.1.0/iconify-icon.min.js"></script>
` + "```" + `

> **离线 / 内网提示**：Iconify CDN 需外网。无外网时请把该脚本下载后随主题上传（例如 ` + "`/themes/{id}/vendor/iconify-icon.min.js`" + `），并改为相对路径引用；或改用本地 SVG/上传图片作为图标。

### 推荐工具函数

` + "```js" + `
function toKebab(name) {
  return String(name || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .replace(/_/g, '-')
    .toLowerCase();
}
function isImageIcon(v) {
  return /^(https?:\\/\\/|\\/uploads\\/|\\/themes\\/|data:image\\/)/i.test(String(v || '').trim());
}
function toIconifyId(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (s.includes(':')) {
    const i = s.indexOf(':');
    return s.slice(0, i).toLowerCase() + ':' + toKebab(s.slice(i + 1));
  }
  if (/^[A-Z][A-Za-z0-9]+$/.test(s)) return 'lucide:' + toKebab(s);
  return '';
}
function fillIcon(container, icon, iconUrl, fallbackText) {
  container.innerHTML = '';
  const url = String(iconUrl || '').trim();
  const val = String(icon || '').trim();
  if ((url && isImageIcon(url)) || (val && isImageIcon(val))) {
    const img = document.createElement('img');
    img.src = url && isImageIcon(url) ? url : val;
    img.alt = '';
    img.loading = 'lazy';
    container.appendChild(img);
    return;
  }
  const id = toIconifyId(val);
  if (id) {
    const el = document.createElement('iconify-icon');
    el.setAttribute('icon', id);
    el.setAttribute('width', '1.5rem');
    el.setAttribute('height', '1.5rem');
    container.appendChild(el);
    return;
  }
  container.textContent = val || String(fallbackText || '?').slice(0, 1).toUpperCase();
}
// 分类：fillIcon(span, cat.icon, '', cat.name)
// 链接：fillIcon(wrap, link.icon, link.icon_url, link.name)
` + "```" + `

## 页脚「管理 / 登录」入口（给 AI，必做）

> **重要 / 必做**：系统默认前台页脚有「管理」或「登录」入口。自定义 HTML 主题**必须同样提供**，否则管理员启用主题后无法从首页进入后台。

### 行为规则

| 登录状态 | 文案 | 链接 |
|----------|------|------|
| 未登录（` + "`authed === false`" + `） | ` + "`登录`" + ` | ` + "`/login`" + ` |
| 已登录（` + "`authed === true`" + `） | ` + "`管理`" + ` | ` + "`/admin`" + ` |

- 登录态来自 ` + "`GET /api/public/categories`" + `（或 ` + "`/api/public/nav`" + `）返回的 ` + "`data.authed`" + `。
- 请求必须带 Cookie：` + "`fetch(url, { credentials: 'include' })`" + `。
- 链接使用站内相对路径（同域），**不要**用 ` + "`target=\"_blank\"`" + `。
- 样式可自由设计，但入口要明显、可点（建议固定在页脚居中或右下角）。

### HTML 结构示例

` + "```html" + `
<footer class="site-footer">
  <a id="adminEntry" class="admin-link" href="/login">登录</a>
</footer>
` + "```" + `

### JS 逻辑示例

` + "```js" + `
function renderAdminEntry(authed) {
  const el = document.getElementById('adminEntry');
  if (!el) return;
  if (authed) {
    el.href = '/admin';
    el.textContent = '管理';
  } else {
    el.href = '/login';
    el.textContent = '登录';
  }
}

// 拉取分类接口时务必带 credentials，并使用返回的 authed：
const catsRes = await fetch('/api/public/categories', { credentials: 'include' }).then((r) => r.json());
const { nav, authed } = catsRes.data || {};
renderAdminEntry(!!authed);
` + "```" + `

### 推荐调用方式（更新）

` + "```js" + `
const [settingsRes, catsRes] = await Promise.all([
  fetch('/api/public/settings', { credentials: 'include' }).then((r) => r.json()),
  fetch('/api/public/categories', { credentials: 'include' }).then((r) => r.json()),
]);
if (settingsRes.code !== 0 || catsRes.code !== 0) throw new Error('load failed');
const settings = settingsRes.data;
const { nav, authed } = catsRes.data;
applyAppearance(settings);
renderAdminEntry(!!authed);
// 再用 settings / nav 渲染标题与导航
` + "```" + `

## 页头日期时间与天气（推荐）

> **推荐**：系统默认前台在头部右侧展示实时时钟、日期、城市定位与天气详情。自定义 HTML 主题建议同样实现，数据全部在浏览器端拉取，**不经过 OneNav 后端**。

### 布局建议

- 左侧：站点 LOGO + ` + "`site_title`" + ` / ` + "`site_subtitle`" + `
- 右侧：日期时间 + 天气信息卡
- 信息卡背景、边框、模糊与搜索栏玻璃风格保持一致（优先用 ` + "`--nav-glass-bg`" + ` 等外观变量，不要写死成另一套白色底）
- 移动端可整行换到标题下方，避免挤压

### 展示内容

| 区域 | 内容 |
|------|------|
| 时间 | 时:分 + 秒（本地时区，每秒刷新） |
| 日期 | 如 ` + "`3月13日 · 周四`" + `（` + "`zh-CN`" + `） |
| 天气主信息 | 天气图标、当前温度、天气文案、城市名 |
| 天气详情 | 体感温度、相对湿度、风速、今日最低~最高气温 |

### 数据来源（浏览器端）

1. **时钟 / 日期**：` + "`new Date()`" + `，` + "`setInterval(..., 1000)`" + ` 刷新。
2. **定位**（优先浏览器，失败再 IP）：
   - ` + "`navigator.geolocation.getCurrentPosition`" + `
   - 失败回退：` + "`GET https://get.geojs.io/v1/ip/geo.json`" + `（取 ` + "`latitude` / `longitude` / `city`" + `）
3. **中文城市名**（有坐标后）：
   - ` + "`GET https://api.bigdatacloud.net/data/reverse-geocode-client?latitude={lat}&longitude={lon}&localityLanguage=zh`" + `
   - 优先取 ` + "`city`" + ` / ` + "`locality`" + ` / ` + "`principalSubdivision`" + `
4. **天气**（Open-Meteo，免密钥）：

` + "```text" + `
GET https://api.open-meteo.com/v1/forecast
  ?latitude={lat}
  &longitude={lon}
  &current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day
  &daily=temperature_2m_max,temperature_2m_min
  &forecast_days=1
  &timezone=auto
` + "```" + `

字段映射：

- 当前温度：` + "`current.temperature_2m`" + `
- 体感：` + "`current.apparent_temperature`" + `
- 湿度：` + "`current.relative_humidity_2m`" + `
- 风速：` + "`current.wind_speed_10m`" + `（km/h）
- 昼夜：` + "`current.is_day`" + `
- 天气码：` + "`current.weather_code`" + `（WMO）
- 今日高低：` + "`daily.temperature_2m_min[0]`" + ` / ` + "`daily.temperature_2m_max[0]`" + `

### weather_code 文案参考

` + "```js" + `
function weatherText(code, isDay) {
  if (code === 0) return isDay ? '晴朗' : '晴夜';
  if (code === 1) return '大部晴朗';
  if (code === 2) return '局部多云';
  if (code === 3) return '阴天';
  if (code === 45 || code === 48) return '有雾';
  if (code >= 51 && code <= 57) return '毛毛雨';
  if (code === 61) return '小雨';
  if (code === 63) return '中雨';
  if (code === 65) return '大雨';
  if (code >= 66 && code <= 67) return '冻雨';
  if (code === 71) return '小雪';
  if (code === 73) return '中雪';
  if (code >= 75 && code <= 77) return '大雪';
  if (code === 80) return '小阵雨';
  if (code === 81) return '中阵雨';
  if (code === 82) return '强阵雨';
  if (code === 85) return '小阵雪';
  if (code === 86) return '强阵雪';
  if (code === 95) return '雷暴';
  if (code === 96 || code === 99) return '雷暴伴冰雹';
  return '阴';
}
` + "```" + `

### 注意

- 首次打开可能弹出定位权限；用户拒绝时必须走 IP 回退，避免整块空白。
- 第三方气象/地理接口可能有跨域或限流，失败时展示「定位失败 / --°」即可。
- 样式跟随站点外观变量，保证后台调色后天气卡与搜索栏观感一致。

## 背景图用法（给 AI，必做）

后台「站点设置 → 前台背景图」支持三种模式：

| ` + "`bg_image_mode`" + ` | 说明 | 公开接口中的 ` + "`bg_image`" + ` |
| --- | --- | --- |
| ` + "`none`" + ` | 纯色/渐变 | 空字符串 |
| ` + "`custom`" + ` | 自定义上传或外链 | ` + "`/uploads/...`" + ` 或 ` + "`https://...`" + ` |
| ` + "`bing`" + ` | Bing 每日壁纸 | 固定为同源代理 ` + "`/api/public/bing-bg`" + ` |

相关接口：

- ` + "`GET /api/public/settings`" + `：返回已解析的 ` + "`bg_image`" + ` / ` + "`bg_image_mode`" + `
- ` + "`GET /api/public/bing-bg`" + `：输出今日 Bing 壁纸图片字节（image/jpeg），供 img 或 CSS background-image 使用
- ` + "`GET /api/public/bing-wallpaper`" + `：返回今日壁纸直链 JSON（调试/预览用）

生成的 ` + "`index.html`" + ` **必须读取并应用** ` + "`settings.bg_image`" + `，例如：

` + "```css" + `
:root { --bg-image: none; --bg-main: #eef2f7; }
body { position: relative; background: var(--bg-main); }
body::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: -2;
  background-color: var(--bg-main);
  background-image: var(--bg-image);
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}
body.has-bg-image::after {
  content: '';
  position: fixed;
  inset: 0;
  z-index: -1;
  background: rgba(15, 23, 42, 0.28);
  pointer-events: none;
}
` + "```" + `

` + "```js" + `
if (settings.bg_image) {
  // Bing 模式时 bg_image 已是 /api/public/bing-bg，不要改成外链
  const bgUrl = String(settings.bg_image).replace(/"/g, '\\"');
  document.documentElement.style.setProperty('--bg-image', 'url("' + bgUrl + '")');
  document.body.classList.add('has-bg-image');
} else {
  document.documentElement.style.setProperty('--bg-image', 'none');
  document.body.classList.remove('has-bg-image');
}
` + "```" + `

说明：

- ` + "`bg_image`" + ` 可能是相对路径（` + "`/uploads/...`" + ` 或 ` + "`/api/public/bing-bg`" + `），**不要擅自改成绝对域名**。
- CSS 中请使用带引号的写法：` + "`url(\"/api/public/bing-bg\")`" + `，避免查询参数破坏解析。
- Bing 壁纸由服务端代理，主题侧无需自行请求 Bing 官网。

## 外观调色约定（给 AI，必做）

后台「主题 → 站点外观调色」与系统默认主题共用同一套字段（保存在 ` + "`/api/public/settings`" + `）。  
**自定义主题必须读取并应用**，上传启用后即可在后台继续改色，无需改主题文件。

### CSS 变量映射（请优先用这些变量写样式）

| settings 字段 | CSS 变量 | 用途 |
| --- | --- | --- |
| ` + "`primary_color`" + ` | ` + "`--nav-primary`" + ` | 主色 / 强调按钮 / 图标底 |
| ` + "`accent_color`" + ` | ` + "`--nav-accent`" + ` | 次强调色 |
| ` + "`bg_color`" + ` | ` + "`--nav-bg-start`" + ` | 背景起始色 |
| ` + "`bg_color_end`" + ` | ` + "`--nav-bg-end`" + ` | 背景结束色 |
| ` + "`text_color`" + ` | ` + "`--nav-text`" + ` | 正文色 |
| ` + "`muted_color`" + ` | ` + "`--nav-muted`" + ` | 次要文字 |
| ` + "`bg_image`" + ` | ` + "`--nav-bg-image`" + ` | 背景图 ` + "`url(\"...\")`" + ` 或 ` + "`none`" + `；Bing 时为 ` + "`/api/public/bing-bg`" + ` |
| ` + "`bg_image_mode`" + ` | （逻辑字段） | ` + "`none` / `custom` / `bing`" + ` |
| ` + "`glass_opacity`" + ` | ` + "`--nav-glass-bg`" + ` | 卡片半透明底（由透明度推算） |
| ` + "`header_opacity`" + ` | ` + "`--nav-header-bg`" + ` | 顶栏半透明底 |
| ` + "`glass_blur`" + ` | ` + "`--nav-glass-blur`" + ` | 如 ` + "`28px`" + ` |
| ` + "`glass_saturate`" + ` | ` + "`--nav-glass-saturate`" + ` | 如 ` + "`180%`" + ` |

样式示例：

` + "```css" + `
:root {
  --nav-primary: #3B82F6;
  --nav-accent: #60A5FA;
  --nav-bg-start: #EEF3F9;
  --nav-bg-end: #F8FAFC;
  --nav-text: #0F172A;
  --nav-muted: #64748B;
  --nav-bg-image: none;
  --nav-glass-blur: 22px;
  --nav-glass-saturate: 160%;
  --nav-glass-bg: rgba(255,255,255,.58);
  --nav-header-bg: rgba(255,255,255,.7);
}
body {
  color: var(--nav-text);
  background: linear-gradient(160deg, var(--nav-bg-start), var(--nav-bg-end));
}
.card {
  background: var(--nav-glass-bg);
  backdrop-filter: blur(var(--nav-glass-blur)) saturate(var(--nav-glass-saturate));
}
a, .accent { color: var(--nav-primary); }
.muted { color: var(--nav-muted); }
` + "```" + `

### 推荐：` + "`applyAppearance(settings)`" + `

` + "```js" + `
function hexToRgb(hex) {
  const raw = String(hex || '').replace('#', '').trim();
  if (raw.length === 3) {
    return {
      r: parseInt(raw[0] + raw[0], 16),
      g: parseInt(raw[1] + raw[1], 16),
      b: parseInt(raw[2] + raw[2], 16),
    };
  }
  if (raw.length !== 6) return { r: 255, g: 255, b: 255 };
  return {
    r: parseInt(raw.slice(0, 2), 16),
    g: parseInt(raw.slice(2, 4), 16),
    b: parseInt(raw.slice(4, 6), 16),
  };
}
function rgba(hex, a) {
  const { r, g, b } = hexToRgb(hex);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
}
function applyAppearance(settings) {
  const s = settings || {};
  const root = document.documentElement;
  const primary = s.primary_color || '#3B82F6';
  const text = s.text_color || '#0F172A';
  const rgb = hexToRgb(text);
  const dark = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000 < 140;
  const surface = dark ? '#1C1C1E' : '#FFFFFF';
  const glass = Math.min(100, Math.max(0, Number(s.glass_opacity ?? 58))) / 100;
  const header = Math.min(100, Math.max(0, Number(s.header_opacity ?? 70))) / 100;
  root.style.setProperty('--nav-primary', primary);
  root.style.setProperty('--nav-accent', s.accent_color || '#60A5FA');
  root.style.setProperty('--nav-bg-start', s.bg_color || '#EEF3F9');
  root.style.setProperty('--nav-bg-end', s.bg_color_end || '#F8FAFC');
  root.style.setProperty('--nav-text', text);
  root.style.setProperty('--nav-muted', s.muted_color || '#64748B');
  if (s.bg_image) {
    const bgUrl = String(s.bg_image).replace(/"/g, '\\"');
    root.style.setProperty('--nav-bg-image', 'url("' + bgUrl + '")');
    document.body.classList.add('has-bg-image');
  } else {
    root.style.setProperty('--nav-bg-image', 'none');
    document.body.classList.remove('has-bg-image');
  }
  root.style.setProperty('--nav-glass-blur', (s.glass_blur ?? 22) + 'px');
  root.style.setProperty('--nav-glass-saturate', (s.glass_saturate ?? 160) + '%');
  root.style.setProperty('--nav-glass-bg', rgba(surface, glass));
  root.style.setProperty('--nav-header-bg', rgba(surface, header));
}
// 拉取 settings 后务必调用：
// applyAppearance(settings);
` + "```" + `

说明：布局与组件可自由设计，但**色值必须走上述变量**，不要把主色、背景色写死在 CSS 里。

## 最小拉取示例

` + "```html" + `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>OneNav</title>
  <style>
    :root {
      --nav-primary: #0A84FF; --nav-bg-start: #f5f7fb; --nav-bg-end: #eef2f7;
      --nav-text: #1f2937; --nav-muted: #64748b; --nav-bg-image: none;
      --nav-glass-bg: rgba(255,255,255,.92);
    }
    body {
      font-family: system-ui, sans-serif; margin: 0; padding: 24px; color: var(--nav-text);
      position: relative; background: linear-gradient(160deg, var(--nav-bg-start), var(--nav-bg-end));
    }
    body::before {
      content: ''; position: fixed; inset: 0; z-index: -2;
      background-image: var(--nav-bg-image); background-size: cover; background-position: center;
    }
    h1 { margin: 0 0 8px; }
    .muted { color: var(--nav-muted); }
    .cat { margin-top: 28px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(180px, 100%), 1fr)); gap: 12px; }
    a.card {
      display: block; padding: 14px; background: var(--nav-glass-bg); border-radius: 12px;
      text-decoration: none; color: inherit; box-shadow: 0 1px 2px rgba(0,0,0,.06);
    }
    a.card:hover { outline: 2px solid var(--nav-primary); }
    @media (max-width: 640px) { body { padding: 16px; } }
  </style>
</head>
<body>
  <header>
    <h1 id="title">Loading...</h1>
    <p id="subtitle" class="muted"></p>
  </header>
  <main id="app"></main>
  <footer class="site-footer" style="margin-top:32px;text-align:center;">
    <a id="adminEntry" href="/login" style="color:var(--nav-primary);text-decoration:none;">登录</a>
  </footer>
  <script>
    // 此处省略 hexToRgb / rgba / applyAppearance，请使用上文完整函数
    function renderAdminEntry(authed) {
      const el = document.getElementById('adminEntry');
      if (!el) return;
      el.href = authed ? '/admin' : '/login';
      el.textContent = authed ? '管理' : '登录';
    }
    async function main() {
      const [settingsRes, catsRes] = await Promise.all([
        fetch('/api/public/settings', { credentials: 'include' }).then((r) => r.json()),
        fetch('/api/public/categories', { credentials: 'include' }).then((r) => r.json()),
      ]);
      if (settingsRes.code !== 0) throw new Error(settingsRes.message || 'settings failed');
      if (catsRes.code !== 0) throw new Error(catsRes.message || 'categories failed');
      const settings = settingsRes.data;
      const nav = (catsRes.data && catsRes.data.nav) || [];
      const authed = !!(catsRes.data && catsRes.data.authed);
      applyAppearance(settings);
      renderAdminEntry(authed);
      document.title = settings.site_title || '站点';
      document.getElementById('title').textContent = settings.site_title || '站点';
      document.getElementById('subtitle').textContent = settings.site_subtitle || '';
      const app = document.getElementById('app');
      const renderCat = (cat, level = 0) => {
        const wrap = document.createElement('section');
        wrap.className = 'cat';
        wrap.innerHTML = '<h' + (level + 2) + '>' + cat.name + '</h' + (level + 2) + '>';
        const grid = document.createElement('div');
        grid.className = 'grid';
        (cat.links || []).forEach((link) => {
          const a = document.createElement('a');
          a.className = 'card';
          a.href = link.url;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.innerHTML = '<strong>' + link.name + '</strong><div class="muted">' + (link.description || link.url) + '</div>';
          grid.appendChild(a);
        });
        wrap.appendChild(grid);
        app.appendChild(wrap);
        (cat.children || []).forEach((child) => renderCat(child, level + 1));
      };
      (nav || []).forEach((c) => renderCat(c));
    }
    main().catch((e) => {
      document.getElementById('title').textContent = '加载失败';
      document.getElementById('subtitle').textContent = e.message;
    });
  </script>
</body>
</html>
` + "```" + `

## 第三方库与插件（推荐：打进 ZIP）

> **重要**：自定义 HTML / ZIP 主题与后台 React 项目相互独立，**不能**使用系统里的 React、Ant Design、` + "`node_modules`" + ` 等依赖。需要的库请以静态文件形式打进主题 ZIP。

### 推荐做法

1. 下载第三方库的浏览器版文件（如 ` + "`xxx.min.js`" + `、` + "`xxx.min.css`" + `）。
2. 放入主题包的 ` + "`vendor/`" + `（第三方）或 ` + "`js/`" + `（自有脚本，如 rem 换算）。
3. 在 ` + "`index.html`" + ` 用**相对路径**引入。
4. 整包打成 ZIP 后，在后台「主题列表 → 上传主题」。

### 推荐目录

` + "```text" + `
my-theme/
  theme.json
  index.html
  css/
    style.css              # 自己的样式
  js/
    app.js                 # 自己的业务逻辑（请求 settings + categories）
    flexible.js            # 可选：移动端 rem 换算
  vendor/                  # 第三方库文件（推荐集中放这里）
    jquery.min.js
    swiper.min.js
    swiper.min.css
  assets/
    logo.png
` + "```" + `

### index.html 引入示例

` + "```html" + `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
  <title>OneNav</title>
  <!-- 移动端换算（自有脚本） -->
  <script src="./js/flexible.js"></script>
  <!-- 第三方样式 -->
  <link rel="stylesheet" href="./vendor/swiper.min.css" />
  <!-- 自己的样式 -->
  <link rel="stylesheet" href="./css/style.css" />
</head>
<body>
  <div id="app"></div>
  <!-- 第三方脚本 -->
  <script src="./vendor/jquery.min.js"></script>
  <script src="./vendor/swiper.min.js"></script>
  <!-- 自己的逻辑：拉取导航并渲染 -->
  <script src="./js/app.js"></script>
</body>
</html>
` + "```" + `

### 注意

- 使用已打包好的浏览器文件（` + "`.min.js` / `.css`" + `），不要写 ` + "`import ... from 'antd'`" + ` 这类需要构建的语法。
- 不要引用 ` + "`node_modules/...`" + `，也不要指望复用 OneNav 后台的插件。
- CDN 外链可用，但离线或内网环境更推荐 **库文件打进 ZIP**。
- 数据通过 ` + "`/api/public/settings`" + ` 与 ` + "`/api/public/categories`" + ` 获取，与用不用第三方库无关。

## 上传与启用流程

1. 按上文准备单文件或 ZIP（含 ` + "`vendor/`" + ` 库文件亦可）。
2. 打开后台 → 主题列表 →「上传主题」，填写主题名称后上传。
3. 在自定义主题中点击「使用」。
4. 在「站点设置」配置前台背景图（纯色 / 自定义上传 / Bing 每日壁纸）并保存。
5. 点击「查看前台」预览效果。

## ZIP 主题包补充说明

- 上传 ` + "`.zip`" + ` 后系统会自动查找 ` + "`index.html`" + `，并保留 ` + "`css/` / `js/` / `vendor/` / `assets/`" + ` 等目录。
- 主题名称优先取上传表单；否则读 ` + "`theme.json`" + `；再否则用 ZIP 文件名。
- 允许类型：html/css/js/json/图片/字体等；禁止可执行或服务端脚本。
- 仍兼容只上传单个 ` + "`index.html`" + `（脚本也可全部内联）。
`
}
