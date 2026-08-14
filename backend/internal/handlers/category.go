package handlers

import (
	"onenav/internal/models"
	"onenav/internal/response"

	"github.com/gin-gonic/gin"
)

type CategoryReq struct {
	Name     string `json:"name" binding:"required,max=128"`
	Icon     string `json:"icon"`
	ParentID *uint  `json:"parent_id"`
	Sort     int    `json:"sort"`
	Private  bool   `json:"private"`
}

func (h *Handler) ListCategories(c *gin.Context) {
	var list []models.Category
	if err := h.DB.Order("sort asc, id asc").Find(&list).Error; err != nil {
		response.ServerError(c, "查询分类失败")
		return
	}
	response.OK(c, buildCategoryTree(list, nil))
}

func (h *Handler) ListCategoriesFlat(c *gin.Context) {
	var list []models.Category
	if err := h.DB.Order("sort asc, id asc").Find(&list).Error; err != nil {
		response.ServerError(c, "查询分类失败")
		return
	}
	response.OK(c, list)
}

// 分类最多两层：顶级 + 其子类。父级必须是顶级分类。
func (h *Handler) validateCategoryParent(parentID *uint, selfID uint, hasChildren bool) error {
	if parentID == nil {
		return nil
	}
	if *parentID == selfID {
		return errBadParent("父级分类不能是自己")
	}
	var parent models.Category
	if err := h.DB.First(&parent, *parentID).Error; err != nil {
		return errBadParent("父级分类不存在")
	}
	if parent.ParentID != nil {
		return errBadParent("分类最多两层，只能挂在顶级分类下")
	}
	if hasChildren {
		return errBadParent("该分类下已有子类，不能再挂到其他分类下")
	}
	return nil
}

type badParentError string

func (e badParentError) Error() string { return string(e) }

func errBadParent(msg string) error { return badParentError(msg) }

func (h *Handler) CreateCategory(c *gin.Context) {
	var req CategoryReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "请填写分类名称")
		return
	}
	if err := h.validateCategoryParent(req.ParentID, 0, false); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	cat := models.Category{
		Name:     req.Name,
		Icon:     req.Icon,
		ParentID: req.ParentID,
		Sort:     req.Sort,
		Private:  req.Private,
	}
	if err := h.DB.Create(&cat).Error; err != nil {
		response.ServerError(c, "创建分类失败")
		return
	}
	response.OK(c, cat)
}

func (h *Handler) UpdateCategory(c *gin.Context) {
	id := c.Param("id")
	var cat models.Category
	if err := h.DB.First(&cat, id).Error; err != nil {
		response.NotFound(c, "分类不存在")
		return
	}
	var req CategoryReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "请填写分类名称")
		return
	}
	var childCount int64
	h.DB.Model(&models.Category{}).Where("parent_id = ?", cat.ID).Count(&childCount)
	if err := h.validateCategoryParent(req.ParentID, cat.ID, childCount > 0); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	cat.Name = req.Name
	cat.Icon = req.Icon
	cat.ParentID = req.ParentID
	cat.Sort = req.Sort
	cat.Private = req.Private
	if err := h.DB.Save(&cat).Error; err != nil {
		response.ServerError(c, "更新分类失败")
		return
	}
	response.OK(c, cat)
}

func (h *Handler) DeleteCategory(c *gin.Context) {
	id := c.Param("id")
	var cat models.Category
	if err := h.DB.First(&cat, id).Error; err != nil {
		response.NotFound(c, "分类不存在")
		return
	}
	var childCount int64
	h.DB.Model(&models.Category{}).Where("parent_id = ?", cat.ID).Count(&childCount)
	if childCount > 0 {
		response.BadRequest(c, "请先删除子分类")
		return
	}
	var linkCount int64
	h.DB.Model(&models.Link{}).Where("category_id = ?", cat.ID).Count(&linkCount)
	if linkCount > 0 {
		response.BadRequest(c, "请先删除该分类下的链接")
		return
	}
	if err := h.DB.Delete(&cat).Error; err != nil {
		response.ServerError(c, "删除分类失败")
		return
	}
	response.OK(c, nil)
}

func buildCategoryTree(list []models.Category, parentID *uint) []models.Category {
	var tree []models.Category
	for _, item := range list {
		same := (parentID == nil && item.ParentID == nil) ||
			(parentID != nil && item.ParentID != nil && *parentID == *item.ParentID)
		if !same {
			continue
		}
		pid := item.ID
		item.Children = buildCategoryTree(list, &pid)
		tree = append(tree, item)
	}
	return tree
}
