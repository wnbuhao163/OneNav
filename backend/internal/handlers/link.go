package handlers

import (
	"onenav/internal/models"
	"onenav/internal/response"
	"strconv"

	"github.com/gin-gonic/gin"
)

type LinkReq struct {
	URL         string `json:"url" binding:"required,max=1024"`
	BackupURL   string `json:"backup_url"`
	Icon        string `json:"icon"`
	IconURL     string `json:"icon_url"`
	Name        string `json:"name" binding:"required,max=256"`
	CategoryID  uint   `json:"category_id" binding:"required"`
	Weight      int    `json:"weight"`
	Private     bool   `json:"private"`
	Description string `json:"description"`
}

func (h *Handler) ListLinks(c *gin.Context) {
	q := h.DB.Model(&models.Link{}).Order("weight desc, id desc")
	if cid := c.Query("category_id"); cid != "" {
		q = q.Where("category_id = ?", cid)
	}
	if kw := c.Query("keyword"); kw != "" {
		like := "%" + kw + "%"
		q = q.Where("name LIKE ? OR url LIKE ? OR description LIKE ?", like, like, like)
	}
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 200 {
		pageSize = 20
	}
	var total int64
	q.Count(&total)
	var list []models.Link
	if err := q.Offset((page - 1) * pageSize).Limit(pageSize).Find(&list).Error; err != nil {
		response.ServerError(c, "查询链接失败")
		return
	}
	response.OK(c, gin.H{"list": list, "total": total, "page": page, "page_size": pageSize})
}

func (h *Handler) CreateLink(c *gin.Context) {
	var req LinkReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "请填写链接名称、URL 和所属分类")
		return
	}
	var cat models.Category
	if err := h.DB.First(&cat, req.CategoryID).Error; err != nil {
		response.BadRequest(c, "所属分类不存在")
		return
	}
	link := models.Link{
		URL:         req.URL,
		BackupURL:   req.BackupURL,
		Icon:        req.Icon,
		IconURL:     req.IconURL,
		Name:        req.Name,
		CategoryID:  req.CategoryID,
		Weight:      req.Weight,
		Private:     req.Private,
		Description: req.Description,
	}
	if err := h.DB.Create(&link).Error; err != nil {
		response.ServerError(c, "创建链接失败")
		return
	}
	response.OK(c, link)
}

func (h *Handler) UpdateLink(c *gin.Context) {
	id := c.Param("id")
	var link models.Link
	if err := h.DB.First(&link, id).Error; err != nil {
		response.NotFound(c, "链接不存在")
		return
	}
	var req LinkReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "请填写链接名称、URL 和所属分类")
		return
	}
	var cat models.Category
	if err := h.DB.First(&cat, req.CategoryID).Error; err != nil {
		response.BadRequest(c, "所属分类不存在")
		return
	}
	link.URL = req.URL
	link.BackupURL = req.BackupURL
	link.Icon = req.Icon
	link.IconURL = req.IconURL
	link.Name = req.Name
	link.CategoryID = req.CategoryID
	link.Weight = req.Weight
	link.Private = req.Private
	link.Description = req.Description
	if err := h.DB.Save(&link).Error; err != nil {
		response.ServerError(c, "更新链接失败")
		return
	}
	response.OK(c, link)
}

func (h *Handler) DeleteLink(c *gin.Context) {
	id := c.Param("id")
	if err := h.DB.Delete(&models.Link{}, id).Error; err != nil {
		response.ServerError(c, "删除链接失败")
		return
	}
	response.OK(c, nil)
}

type BatchMoveLinksReq struct {
	IDs        []uint `json:"ids" binding:"required,min=1"`
	CategoryID uint   `json:"category_id" binding:"required"`
}

func (h *Handler) BatchMoveLinks(c *gin.Context) {
	var req BatchMoveLinksReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "请选择链接并指定目标分类")
		return
	}
	var cat models.Category
	if err := h.DB.First(&cat, req.CategoryID).Error; err != nil {
		response.BadRequest(c, "目标分类不存在")
		return
	}
	res := h.DB.Model(&models.Link{}).Where("id IN ?", req.IDs).Update("category_id", req.CategoryID)
	if res.Error != nil {
		response.ServerError(c, "批量修改分类失败")
		return
	}
	response.OK(c, gin.H{"updated": res.RowsAffected})
}
