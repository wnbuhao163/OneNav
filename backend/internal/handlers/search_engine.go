package handlers

import (
	"regexp"
	"strings"
	"time"

	"onenav/internal/models"
	"onenav/internal/response"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

var searchEngineKeyRe = regexp.MustCompile(`^[a-z][a-z0-9_-]{1,62}$`)

type searchEngineSeed struct {
	Key     string
	Name    string
	Group   string
	URL     string
	Sort    int
	Default bool // 默认启用
}

func builtinSearchEngineSeeds() []searchEngineSeed {
	return []searchEngineSeed{
		// 网页搜索：常用引擎默认启用
		{Key: "baidu", Name: "百度", Group: "web", URL: "https://www.baidu.com/s?wd={q}", Sort: 10, Default: true},
		{Key: "google", Name: "谷歌", Group: "web", URL: "https://www.google.com/search?q={q}", Sort: 20, Default: true},
		{Key: "bing", Name: "必应", Group: "web", URL: "https://www.bing.com/search?q={q}", Sort: 30, Default: true},
		{Key: "sogou", Name: "搜狗", Group: "web", URL: "https://www.sogou.com/web?query={q}", Sort: 40, Default: true},
		{Key: "duckduckgo", Name: "DuckDuckGo", Group: "web", URL: "https://duckduckgo.com/?q={q}", Sort: 50, Default: false},
		{Key: "github", Name: "GitHub", Group: "content", URL: "https://github.com/search?q={q}", Sort: 110, Default: false},
		{Key: "bilibili", Name: "B站", Group: "content", URL: "https://search.bilibili.com/all?keyword={q}", Sort: 120, Default: false},
		{Key: "zhihu", Name: "知乎", Group: "content", URL: "https://www.zhihu.com/search?type=content&q={q}", Sort: 130, Default: false},
		{Key: "baidupan", Name: "百度网盘", Group: "pan", URL: "https://pan.qianfan.app/#/search?type=baidu&keyword={q}", Sort: 210, Default: false},
		{Key: "alipansou", Name: "阿里云盘", Group: "pan", URL: "https://www.alipansou.com/search?k={q}", Sort: 220, Default: false},
		{Key: "quark", Name: "夸克网盘", Group: "pan", URL: "https://pan.qianfan.app/#/search?type=quark&keyword={q}", Sort: 230, Default: false},
		{Key: "xunlei", Name: "迅雷云盘", Group: "pan", URL: "https://pan.qianfan.app/#/search?type=xunlei&keyword={q}", Sort: 240, Default: false},
		{Key: "tianyi", Name: "天翼云盘", Group: "pan", URL: "https://pan.qianfan.app/#/search?type=tianyi&keyword={q}", Sort: 250, Default: false},
		{Key: "lanzou", Name: "蓝奏云", Group: "pan", URL: "https://pan.qianfan.app/#/search?type=lanzou&keyword={q}", Sort: 260, Default: false},
		{Key: "yunsopan", Name: "云搜盘", Group: "pan", URL: "https://www.yunsopan.com/search?keyword={q}", Sort: 270, Default: false},
		{Key: "qianfan", Name: "千帆聚合", Group: "pan", URL: "https://pan.qianfan.app/#/search?keyword={q}", Sort: 280, Default: false},
	}
}

var defaultWebEngineKeys = []string{"baidu", "google", "bing", "sogou"}

func normalizeSearchGroup(g string) string {
	switch strings.ToLower(strings.TrimSpace(g)) {
	case "web", "content", "pan":
		return strings.ToLower(strings.TrimSpace(g))
	default:
		return ""
	}
}

func (h *Handler) EnsureSearchEnginesSeeded() {
	enabledKeys := map[string]bool{}
	var setting models.Setting
	hasSettingList := false
	if err := h.DB.First(&setting).Error; err == nil && strings.TrimSpace(setting.SearchEngines) != "" {
		hasSettingList = true
		for _, id := range strings.Split(setting.SearchEngines, ",") {
			id = strings.TrimSpace(id)
			if id == "pan123" {
				id = "qianfan"
			}
			if id != "" {
				enabledKeys[id] = true
			}
		}
	}
	// 网页常用引擎始终默认开启
	for _, k := range defaultWebEngineKeys {
		enabledKeys[k] = true
	}

	now := time.Now()
	changed := false
	for _, s := range builtinSearchEngineSeeds() {
		var row models.SearchEngine
		err := h.DB.Where("`key` = ?", s.Key).First(&row).Error
		if err != nil {
			enabled := s.Default
			if hasSettingList {
				enabled = enabledKeys[s.Key]
			}
			row = models.SearchEngine{
				Key:       s.Key,
				Name:      s.Name,
				Group:     s.Group,
				URL:       s.URL,
				Enabled:   enabled,
				Builtin:   true,
				Sort:      s.Sort,
				CreatedAt: now,
				UpdatedAt: now,
			}
			if h.DB.Create(&row).Error == nil {
				changed = true
			}
		}
	}

	// 若网页分类当前没有任何启用引擎，则打开常用四项
	var webEnabled int64
	_ = h.DB.Model(&models.SearchEngine{}).Where("engine_group = ? AND enabled = ?", "web", true).Count(&webEnabled).Error
	if webEnabled == 0 {
		if err := h.DB.Model(&models.SearchEngine{}).
			Where("`key` IN ?", defaultWebEngineKeys).
			Update("enabled", true).Error; err == nil {
			changed = true
		}
	}

	// 一次性：把网页常用引擎打开（已有库升级用；之后用户可自行关闭）
	var meta models.AppMeta
	if h.DB.Where("`key` = ?", "search_web_defaults_v1").First(&meta).Error != nil {
		if err := h.DB.Model(&models.SearchEngine{}).
			Where("`key` IN ?", defaultWebEngineKeys).
			Updates(map[string]interface{}{"enabled": true, "updated_at": now}).Error; err == nil {
			_ = h.DB.Create(&models.AppMeta{Key: "search_web_defaults_v1", Value: "1", UpdatedAt: now}).Error
			changed = true
		}
	}
	if changed {
		h.syncSettingSearchEngineIDs()
	}
}

func (h *Handler) listSearchEngines(enabledOnly bool) ([]models.SearchEngine, error) {
	var list []models.SearchEngine
	q := h.DB.Order("sort asc, id asc")
	if enabledOnly {
		q = q.Where("enabled = ?", true)
	}
	if err := q.Find(&list).Error; err != nil {
		return nil, err
	}
	return list, nil
}

func (h *Handler) enabledSearchEngineKeys() string {
	list, err := h.listSearchEngines(true)
	if err != nil || len(list) == 0 {
		return "baidu,google,bing"
	}
	keys := make([]string, 0, len(list))
	for _, e := range list {
		keys = append(keys, e.Key)
	}
	return strings.Join(keys, ",")
}

func (h *Handler) syncSettingSearchEngineIDs() {
	var s models.Setting
	if err := h.DB.First(&s).Error; err != nil {
		return
	}
	keys := h.enabledSearchEngineKeys()
	s.SearchEngines = keys
	if s.SearchDefault == "" || !strings.Contains(","+keys+",", ","+s.SearchDefault+",") {
		parts := strings.Split(keys, ",")
		if len(parts) > 0 {
			s.SearchDefault = parts[0]
		}
	}
	_ = h.DB.Save(&s).Error
}

func publicSearchEngineItem(e models.SearchEngine) gin.H {
	return gin.H{
		"id":      e.Key,
		"key":     e.Key,
		"name":    e.Name,
		"group":   e.Group,
		"url":     e.URL,
		"enabled": e.Enabled,
		"builtin": e.Builtin,
		"sort":    e.Sort,
	}
}

func (h *Handler) ListAdminSearchEngines(c *gin.Context) {
	h.EnsureSearchEnginesSeeded()
	list, err := h.listSearchEngines(false)
	if err != nil {
		response.ServerError(c, "加载搜索引擎失败")
		return
	}
	items := make([]gin.H, 0, len(list))
	for _, e := range list {
		item := publicSearchEngineItem(e)
		item["id"] = e.ID
		item["engine_key"] = e.Key
		items = append(items, item)
	}
	response.OK(c, gin.H{"list": items})
}

type SearchEngineReq struct {
	Key     string `json:"key"`
	Name    string `json:"name"`
	Group   string `json:"group"`
	URL     string `json:"url"`
	Enabled *bool  `json:"enabled"`
	Sort    *int   `json:"sort"`
}

func (h *Handler) CreateSearchEngine(c *gin.Context) {
	h.EnsureSearchEnginesSeeded()
	var req SearchEngineReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "参数错误")
		return
	}
	name := strings.TrimSpace(req.Name)
	url := strings.TrimSpace(req.URL)
	group := normalizeSearchGroup(req.Group)
	if name == "" || url == "" || group == "" {
		response.BadRequest(c, "请填写名称、分组与搜索 URL")
		return
	}
	if !strings.Contains(url, "{q}") {
		response.BadRequest(c, "搜索 URL 必须包含 {q} 占位符")
		return
	}
	key := strings.TrimSpace(strings.ToLower(req.Key))
	if key == "" {
		key = "custom_" + strings.ReplaceAll(uuid.NewString(), "-", "")[:10]
	}
	if !searchEngineKeyRe.MatchString(key) {
		response.BadRequest(c, "引擎标识仅支持小写字母开头的字母数字下划线")
		return
	}
	var exists int64
	_ = h.DB.Model(&models.SearchEngine{}).Where("`key` = ?", key).Count(&exists).Error
	if exists > 0 {
		response.BadRequest(c, "引擎标识已存在")
		return
	}
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	sort := 500
	if req.Sort != nil {
		sort = *req.Sort
	}
	row := models.SearchEngine{
		Key:     key,
		Name:    name,
		Group:   group,
		URL:     url,
		Enabled: enabled,
		Builtin: false,
		Sort:    sort,
	}
	if err := h.DB.Create(&row).Error; err != nil {
		response.ServerError(c, "创建失败")
		return
	}
	h.syncSettingSearchEngineIDs()
	item := publicSearchEngineItem(row)
	item["id"] = row.ID
	item["engine_key"] = row.Key
	response.OK(c, item)
}

func (h *Handler) UpdateSearchEngine(c *gin.Context) {
	h.EnsureSearchEnginesSeeded()
	id := c.Param("id")
	var row models.SearchEngine
	if err := h.DB.First(&row, id).Error; err != nil {
		response.NotFound(c, "搜索引擎不存在")
		return
	}
	var req SearchEngineReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "参数错误")
		return
	}
	if name := strings.TrimSpace(req.Name); name != "" {
		row.Name = name
	}
	if group := normalizeSearchGroup(req.Group); group != "" {
		row.Group = group
	}
	if url := strings.TrimSpace(req.URL); url != "" {
		if !strings.Contains(url, "{q}") {
			response.BadRequest(c, "搜索 URL 必须包含 {q} 占位符")
			return
		}
		row.URL = url
	}
	if req.Enabled != nil {
		row.Enabled = *req.Enabled
	}
	if req.Sort != nil {
		row.Sort = *req.Sort
	}
	// 内置引擎不允许改 key；自定义也不在此改 key，避免破坏引用
	if err := h.DB.Save(&row).Error; err != nil {
		response.ServerError(c, "保存失败")
		return
	}
	h.syncSettingSearchEngineIDs()
	item := publicSearchEngineItem(row)
	item["id"] = row.ID
	item["engine_key"] = row.Key
	response.OK(c, item)
}

func (h *Handler) DeleteSearchEngine(c *gin.Context) {
	h.EnsureSearchEnginesSeeded()
	id := c.Param("id")
	var row models.SearchEngine
	if err := h.DB.First(&row, id).Error; err != nil {
		response.NotFound(c, "搜索引擎不存在")
		return
	}
	if row.Builtin {
		response.BadRequest(c, "内置搜索引擎不能删除，可改为禁用")
		return
	}
	if err := h.DB.Delete(&row).Error; err != nil {
		response.ServerError(c, "删除失败")
		return
	}
	h.syncSettingSearchEngineIDs()
	response.OK(c, gin.H{"deleted": true})
}

func (h *Handler) publicSearchEngineList() []gin.H {
	h.EnsureSearchEnginesSeeded()
	list, err := h.listSearchEngines(true)
	if err != nil {
		return nil
	}
	items := make([]gin.H, 0, len(list))
	for _, e := range list {
		items = append(items, publicSearchEngineItem(e))
	}
	return items
}

// attachSearchEngines 往公开 settings 中注入 search_engine_list
func (h *Handler) attachSearchEngines(setting models.Setting) gin.H {
	engines := h.publicSearchEngineList()
	keys := make([]string, 0, len(engines))
	for _, e := range engines {
		if k, ok := e["key"].(string); ok {
			keys = append(keys, k)
		}
	}
	setting.SearchEngines = strings.Join(keys, ",")
	if setting.SearchDefault == "" || (len(keys) > 0 && !containsString(keys, setting.SearchDefault)) {
		if len(keys) > 0 {
			setting.SearchDefault = keys[0]
		}
	}
	return gin.H{
		"id":               setting.ID,
		"site_title":       setting.SiteTitle,
		"site_logo":        setting.SiteLogo,
		"site_subtitle":    setting.SiteSubtitle,
		"site_keywords":    setting.SiteKeywords,
		"site_description": setting.SiteDescription,
		"custom_header":    setting.CustomHeader,
		"custom_footer":    setting.CustomFooter,
		"search_enabled":   setting.SearchEnabled,
		"search_default":   setting.SearchDefault,
		"search_engines":   setting.SearchEngines,
		"search_engine_list": engines,
		"theme":            setting.Theme,
		"primary_color":    setting.PrimaryColor,
		"accent_color":     setting.AccentColor,
		"bg_color":         setting.BgColor,
		"bg_color_end":     setting.BgColorEnd,
		"text_color":       setting.TextColor,
		"muted_color":      setting.MutedColor,
		"bg_image":         setting.BgImage,
		"bg_image_mode":    setting.BgImageMode,
		"glass_opacity":    setting.GlassOpacity,
		"glass_blur":       setting.GlassBlur,
		"glass_saturate":   setting.GlassSaturate,
		"header_opacity":   setting.HeaderOpacity,
		"created_at":       setting.CreatedAt,
		"updated_at":       setting.UpdatedAt,
	}
}

func containsString(list []string, v string) bool {
	for _, s := range list {
		if s == v {
			return true
		}
	}
	return false
}
