package handlers

import (
	"onenav/internal/models"
	"onenav/internal/response"
	"strings"

	"github.com/gin-gonic/gin"
)

type SettingReq struct {
	SiteTitle       string `json:"site_title"`
	SiteLogo        string `json:"site_logo"`
	SiteSubtitle    string `json:"site_subtitle"`
	SiteKeywords    string `json:"site_keywords"`
	SiteDescription string `json:"site_description"`
	CustomHeader    string `json:"custom_header"`
	CustomFooter    string `json:"custom_footer"`
	SearchEnabled   *bool  `json:"search_enabled"`
	SearchDefault   string `json:"search_default"`
	SearchEngines   string `json:"search_engines"`
	Theme           string `json:"theme"`
	PrimaryColor    string `json:"primary_color"`
	AccentColor     string `json:"accent_color"`
	BgColor         string `json:"bg_color"`
	BgColorEnd      string `json:"bg_color_end"`
	TextColor       string `json:"text_color"`
	MutedColor      string `json:"muted_color"`
	BgImage         string `json:"bg_image"`
	BgImageMode     string `json:"bg_image_mode"`
	GlassOpacity    *int   `json:"glass_opacity"`
	GlassBlur       *int   `json:"glass_blur"`
	GlassSaturate   *int   `json:"glass_saturate"`
	HeaderOpacity   *int   `json:"header_opacity"`
}

func defaultSetting() models.Setting {
	return models.Setting{
		SiteTitle:     "我的导航",
		SearchEnabled: true,
		SearchDefault: "baidu",
		SearchEngines: "baidu,google,bing,alipansou",
		Theme:         "system",
		PrimaryColor:  "#3B82F6",
		AccentColor:   "#60A5FA",
		BgColor:       "#EEF3F9",
		BgColorEnd:    "#F8FAFC",
		TextColor:     "#0F172A",
		MutedColor:    "#64748B",
		GlassOpacity:  58,
		GlassBlur:     22,
		GlassSaturate: 160,
		HeaderOpacity: 70,
		BgImageMode:   "none",
	}
}

func clampPercent(v, fallback int) int {
	if v < 0 || v > 100 {
		return fallback
	}
	return v
}

func clampBlur(v, fallback int) int {
	if v < 0 || v > 80 {
		return fallback
	}
	return v
}

func clampSaturate(v, fallback int) int {
	if v < 100 || v > 250 {
		return fallback
	}
	return v
}

func applyAppearance(s *models.Setting, req SettingReq) {
	if req.Theme != "" {
		s.Theme = req.Theme
	}
	if req.PrimaryColor != "" {
		s.PrimaryColor = req.PrimaryColor
	}
	if req.AccentColor != "" {
		s.AccentColor = req.AccentColor
	}
	if req.BgColor != "" {
		s.BgColor = req.BgColor
	}
	if req.BgColorEnd != "" {
		s.BgColorEnd = req.BgColorEnd
	}
	if req.TextColor != "" {
		s.TextColor = req.TextColor
	}
	if req.MutedColor != "" {
		s.MutedColor = req.MutedColor
	}
	s.BgImage = req.BgImage
	if req.BgImageMode != "" {
		s.BgImageMode = req.BgImageMode
	}
	normalizeBgImageMode(s)
	if req.GlassOpacity != nil {
		s.GlassOpacity = clampPercent(*req.GlassOpacity, 58)
	}
	if req.GlassBlur != nil {
		s.GlassBlur = clampBlur(*req.GlassBlur, 22)
	}
	if req.GlassSaturate != nil {
		s.GlassSaturate = clampSaturate(*req.GlassSaturate, 160)
	}
	if req.HeaderOpacity != nil {
		s.HeaderOpacity = clampPercent(*req.HeaderOpacity, 70)
	}
	normalizeAppearance(s)
}

func normalizeAppearance(s *models.Setting) {
	d := defaultSetting()
	if s.Theme == "" || isLegacyBuiltinTheme(s.Theme) {
		s.Theme = systemThemeKey
	}
	if s.SearchDefault == "" {
		s.SearchDefault = d.SearchDefault
	}
	if s.SearchEngines == "" {
		s.SearchEngines = d.SearchEngines
		s.SearchEnabled = true
	}
	// 旧出厂配色 → 新默认（用户若已改过主色/背景则不动）
	if isLegacyFactoryAppearance(s) {
		s.PrimaryColor = d.PrimaryColor
		s.AccentColor = d.AccentColor
		s.BgColor = d.BgColor
		s.BgColorEnd = d.BgColorEnd
		s.TextColor = d.TextColor
		s.MutedColor = d.MutedColor
		s.GlassOpacity = d.GlassOpacity
		s.GlassBlur = d.GlassBlur
		s.GlassSaturate = d.GlassSaturate
		s.HeaderOpacity = d.HeaderOpacity
	}
	// 旧数据迁移后颜色字段为空时，按系统默认外观补齐
	if s.PrimaryColor == "" {
		p := d
		s.PrimaryColor = p.PrimaryColor
		s.AccentColor = p.AccentColor
		s.BgColor = p.BgColor
		s.BgColorEnd = p.BgColorEnd
		s.TextColor = p.TextColor
		s.MutedColor = p.MutedColor
		s.GlassOpacity = p.GlassOpacity
		s.GlassBlur = p.GlassBlur
		s.GlassSaturate = p.GlassSaturate
		s.HeaderOpacity = p.HeaderOpacity
		return
	}
	if s.AccentColor == "" {
		s.AccentColor = d.AccentColor
	}
	if s.BgColor == "" {
		s.BgColor = d.BgColor
	}
	if s.BgColorEnd == "" {
		s.BgColorEnd = d.BgColorEnd
	}
	if s.TextColor == "" {
		s.TextColor = d.TextColor
	}
	if s.MutedColor == "" {
		s.MutedColor = d.MutedColor
	}
	if s.GlassBlur == 0 {
		s.GlassBlur = d.GlassBlur
	}
	if s.GlassSaturate == 0 {
		s.GlassSaturate = d.GlassSaturate
	}
	s.GlassOpacity = clampPercent(s.GlassOpacity, d.GlassOpacity)
	s.GlassBlur = clampBlur(s.GlassBlur, d.GlassBlur)
	s.GlassSaturate = clampSaturate(s.GlassSaturate, d.GlassSaturate)
	s.HeaderOpacity = clampPercent(s.HeaderOpacity, d.HeaderOpacity)
	normalizeBgImageMode(s)
}

func eqHexColor(a, b string) bool {
	return strings.EqualFold(strings.TrimSpace(a), strings.TrimSpace(b))
}

// 识别上一版出厂配色，便于自动换成更和谐的默认色
func isLegacyFactoryAppearance(s *models.Setting) bool {
	return eqHexColor(s.PrimaryColor, "#0A84FF") &&
		eqHexColor(s.AccentColor, "#64D2FF") &&
		eqHexColor(s.BgColor, "#D6E4F0") &&
		eqHexColor(s.BgColorEnd, "#F2F4F7") &&
		eqHexColor(s.TextColor, "#1C1C1E") &&
		eqHexColor(s.MutedColor, "#6C6C70")
}

func (h *Handler) GetSettings(c *gin.Context) {
	var s models.Setting
	if err := h.DB.First(&s).Error; err != nil {
		response.OK(c, defaultSetting())
		return
	}
	wasLegacy := isLegacyFactoryAppearance(&s)
	normalizeAppearance(&s)
	if wasLegacy {
		_ = h.DB.Save(&s).Error
	}
	// 管理端设置页不回传 AI Key 明文
	s.AiApiKey = ""
	response.OK(c, s)
}

func (h *Handler) UpdateSettings(c *gin.Context) {
	var req SettingReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "参数错误")
		return
	}
	var s models.Setting
	if err := h.DB.First(&s).Error; err != nil {
		s = defaultSetting()
		s.SiteTitle = req.SiteTitle
		s.SiteLogo = req.SiteLogo
		s.SiteSubtitle = req.SiteSubtitle
		s.SiteKeywords = req.SiteKeywords
		s.SiteDescription = req.SiteDescription
		s.CustomHeader = req.CustomHeader
		s.CustomFooter = req.CustomFooter
		applySearch(&s, req)
		applyAppearance(&s, req)
		if err := h.DB.Create(&s).Error; err != nil {
			response.ServerError(c, "保存设置失败")
			return
		}
		response.OK(c, s)
		return
	}
	s.SiteTitle = req.SiteTitle
	s.SiteLogo = req.SiteLogo
	s.SiteSubtitle = req.SiteSubtitle
	s.SiteKeywords = req.SiteKeywords
	s.SiteDescription = req.SiteDescription
	s.CustomHeader = req.CustomHeader
	s.CustomFooter = req.CustomFooter
	applySearch(&s, req)
	applyAppearance(&s, req)
	if err := h.DB.Save(&s).Error; err != nil {
		response.ServerError(c, "保存设置失败")
		return
	}
	response.OK(c, s)
}

func applySearch(s *models.Setting, req SettingReq) {
	if req.SearchEnabled != nil {
		s.SearchEnabled = *req.SearchEnabled
	}
	if req.SearchDefault != "" {
		s.SearchDefault = req.SearchDefault
	}
	if req.SearchEngines != "" {
		s.SearchEngines = req.SearchEngines
	}
	normalizeAppearance(s)
}
