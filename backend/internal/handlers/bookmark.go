package handlers

import (
	"onenav/internal/models"
	"onenav/internal/response"
	"strings"

	"github.com/gin-gonic/gin"
	"golang.org/x/net/html"
)

type BookmarkImportReq struct {
	HTML       string `json:"html" binding:"required"`
	CategoryID uint   `json:"category_id" binding:"required"`
	Private    bool   `json:"private"`
}

type bookmarkItem struct {
	Name string
	URL  string
}

// ImportBookmarks 解析 Chrome / Edge 导出的 HTML 书签
func (h *Handler) ImportBookmarks(c *gin.Context) {
	var req BookmarkImportReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "请上传书签 HTML，并选择目标分类")
		return
	}
	var cat models.Category
	if err := h.DB.First(&cat, req.CategoryID).Error; err != nil {
		response.BadRequest(c, "目标分类不存在")
		return
	}
	items := parseBookmarkHTML(req.HTML)
	if len(items) == 0 {
		response.BadRequest(c, "未解析到有效书签，请确认是 Chrome/Edge 导出的 HTML")
		return
	}
	created := 0
	for _, item := range items {
		link := models.Link{
			URL:        item.URL,
			Name:       item.Name,
			CategoryID: req.CategoryID,
			Private:    req.Private,
			Weight:     0,
		}
		if err := h.DB.Create(&link).Error; err == nil {
			created++
		}
	}
	response.OK(c, gin.H{"imported": created, "parsed": len(items)})
}

func parseBookmarkHTML(raw string) []bookmarkItem {
	doc, err := html.Parse(strings.NewReader(raw))
	if err != nil {
		return nil
	}
	var items []bookmarkItem
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode && n.Data == "a" {
			var href, name string
			for _, a := range n.Attr {
				if a.Key == "href" {
					href = a.Val
				}
			}
			if n.FirstChild != nil {
				name = strings.TrimSpace(n.FirstChild.Data)
			}
			if href != "" && (strings.HasPrefix(href, "http://") || strings.HasPrefix(href, "https://")) {
				if name == "" {
					name = href
				}
				items = append(items, bookmarkItem{Name: name, URL: href})
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)
	return items
}
