package handlers

import (
	"onenav/internal/middleware"
	"onenav/internal/models"
	"onenav/internal/response"

	"github.com/gin-gonic/gin"
)

func (h *Handler) loadPublicSetting() models.Setting {
	var setting models.Setting
	if err := h.DB.First(&setting).Error; err != nil {
		setting = defaultSetting()
		setting.SiteSubtitle = "简洁好用的个人导航"
		return setting
	}
	wasLegacy := isLegacyFactoryAppearance(&setting)
	normalizeAppearance(&setting)
	if wasLegacy {
		_ = h.DB.Save(&setting).Error
	}
	applyPublicBgImage(&setting)
	return setting
}

func (h *Handler) loadPublicCategoryTree(authed bool) ([]models.Category, error) {
	var categories []models.Category
	q := h.DB.Order("sort asc, id asc")
	if !authed {
		q = q.Where("private = ?", false)
	}
	if err := q.Find(&categories).Error; err != nil {
		return nil, err
	}

	catIDs := make([]uint, 0, len(categories))
	for _, cat := range categories {
		catIDs = append(catIDs, cat.ID)
	}

	var links []models.Link
	if len(catIDs) > 0 {
		lq := h.DB.Where("category_id IN ?", catIDs).Order("weight desc, id desc")
		if !authed {
			lq = lq.Where("private = ?", false)
		}
		_ = lq.Find(&links).Error
	}

	linksByCat := map[uint][]models.Link{}
	for _, link := range links {
		linksByCat[link.CategoryID] = append(linksByCat[link.CategoryID], link)
	}
	for i := range categories {
		categories[i].Links = linksByCat[categories[i].ID]
	}
	return buildCategoryTree(categories, nil), nil
}

// PublicSettings 站点设置（标题/LOGO/背景图/搜索配置等）
func (h *Handler) PublicSettings(c *gin.Context) {
	response.OK(c, h.attachSearchEngines(h.loadPublicSetting()))
}

// PublicCategories 分类树 + 链接（不含站点设置）
func (h *Handler) PublicCategories(c *gin.Context) {
	authed := middleware.IsAuthed(c)
	tree, err := h.loadPublicCategoryTree(authed)
	if err != nil {
		response.ServerError(c, "加载分类失败")
		return
	}
	response.OK(c, gin.H{
		"nav":    tree,
		"authed": authed,
	})
}

// PublicNav 兼容旧版：一次返回 settings + nav（新主题请分别调用 settings / categories）
func (h *Handler) PublicNav(c *gin.Context) {
	authed := middleware.IsAuthed(c)
	setting := h.loadPublicSetting()
	tree, err := h.loadPublicCategoryTree(authed)
	if err != nil {
		response.ServerError(c, "加载分类失败")
		return
	}
	response.OK(c, gin.H{
		"settings": h.attachSearchEngines(setting),
		"nav":      tree,
		"authed":   authed,
	})
}
