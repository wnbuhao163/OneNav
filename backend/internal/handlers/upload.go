package handlers

import (
	"fmt"
	"onenav/internal/response"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

var allowedImageExt = map[string]bool{
	".png":  true,
	".jpg":  true,
	".jpeg": true,
	".gif":  true,
	".webp": true,
	".svg":  true,
	".ico":  true,
}

func (h *Handler) UploadIcon(c *gin.Context) {
	h.saveUploadedImage(c, 2*1024*1024, "图片不能超过 2MB")
}

// UploadBackground 前台背景图上传，不限制文件大小
func (h *Handler) UploadBackground(c *gin.Context) {
	h.saveUploadedImage(c, 0, "")
}

func (h *Handler) saveUploadedImage(c *gin.Context, maxBytes int64, sizeErr string) {
	file, err := c.FormFile("file")
	if err != nil {
		response.BadRequest(c, "请选择图片文件")
		return
	}
	if maxBytes > 0 && file.Size > maxBytes {
		response.BadRequest(c, sizeErr)
		return
	}
	ext := strings.ToLower(filepath.Ext(file.Filename))
	if !allowedImageExt[ext] {
		response.BadRequest(c, "仅支持 png/jpg/gif/webp/svg/ico")
		return
	}
	dir := filepath.Join(h.Cfg.DataDir, "uploads")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		response.ServerError(c, "创建上传目录失败")
		return
	}
	name := fmt.Sprintf("%s_%s%s", time.Now().Format("20060102"), uuid.NewString()[:8], ext)
	dest := filepath.Join(dir, name)
	if err := c.SaveUploadedFile(file, dest); err != nil {
		response.ServerError(c, "保存文件失败")
		return
	}
	response.OK(c, gin.H{
		"url":  "/uploads/" + name,
		"name": name,
	})
}
