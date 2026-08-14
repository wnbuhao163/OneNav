package handlers

import (
	"onenav/internal/models"
	"onenav/internal/response"
	"os"

	"github.com/gin-gonic/gin"
)

func (h *Handler) ListThemes(c *gin.Context) {
	system := systemThemeItem()
	custom := h.listCustomThemes()
	themes := append([]gin.H{system}, custom...)

	current := h.currentThemeKey()
	s, err := h.ensureSetting()
	if err != nil {
		s = defaultSetting()
	}

	response.OK(c, gin.H{
		"themes":       themes,
		"system":       system,
		"custom":       custom,
		"current":      current,
		"frontend_url": h.frontendURLForTheme(current),
		"appearance":   s,
	})
}

func (h *Handler) ApplyTheme(c *gin.Context) {
	var req struct {
		Theme string `json:"theme" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "请选择主题")
		return
	}

	// 自定义 HTML 主题
	if isHtmlThemeKey(req.Theme) {
		fsKey := htmlThemeFSKey(req.Theme)
		var row models.HtmlTheme
		if err := h.DB.Where("`key` = ?", fsKey).First(&row).Error; err != nil {
			response.BadRequest(c, "主题不存在")
			return
		}
		path := h.htmlThemeIndexPath(fsKey)
		if _, err := os.Stat(path); err != nil {
			response.BadRequest(c, "主题文件缺失，请重新上传")
			return
		}
		s, err := h.ensureSetting()
		if err != nil {
			response.ServerError(c, "读取设置失败")
			return
		}
		s.Theme = htmlThemePrefix + fsKey
		if err := h.DB.Save(&s).Error; err != nil {
			response.ServerError(c, "应用主题失败")
			return
		}
		response.OK(c, gin.H{
			"theme":        s.Theme,
			"appearance":   s,
			"frontend_url": h.htmlThemePreviewURL(fsKey),
		})
		return
	}

	// 系统默认主题（含旧 glass/default/dark/card 兼容）
	if !isSystemThemeKey(req.Theme) {
		response.BadRequest(c, "主题不存在")
		return
	}

	s, err := h.ensureSetting()
	if err != nil {
		response.ServerError(c, "读取设置失败")
		return
	}
	s.Theme = systemThemeKey
	if err := h.DB.Save(&s).Error; err != nil {
		response.ServerError(c, "应用主题失败")
		return
	}
	response.OK(c, gin.H{
		"theme":        systemThemeKey,
		"appearance":   s,
		"frontend_url": "/",
	})
}
