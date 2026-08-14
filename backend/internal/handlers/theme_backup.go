package handlers

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"onenav/internal/database"
	"onenav/internal/models"
	"onenav/internal/response"

	"github.com/gin-gonic/gin"
)

// BackupExport 导出完整备份：数据库 + uploads + themes（zip）
func (h *Handler) BackupExport(c *gin.Context) {
	filename := "onenav-backup-" + time.Now().Format("20060102-150405") + ".zip"
	c.Header("Content-Disposition", "attachment; filename="+filename)
	c.Header("Content-Type", "application/zip")

	zw := zip.NewWriter(c.Writer)
	defer zw.Close()

	// 先 checkpoint，尽量让 WAL 合并进主库再拷贝
	_ = h.DB.Exec("PRAGMA wal_checkpoint(TRUNCATE)")

	if err := zipAddFile(zw, h.Cfg.DBPath, "onenav.db"); err != nil {
		// 头已写出时无法再改状态码，尽量写完
		return
	}
	uploadsDir := filepath.Join(h.Cfg.DataDir, "uploads")
	_ = zipAddDir(zw, uploadsDir, "uploads")
	themesDir := filepath.Join(h.Cfg.DataDir, "themes")
	_ = zipAddDir(zw, themesDir, "themes")
	// 可选：一并备份自动生成的 jwt（方便换机）；不含则新环境会重新生成导致旧 cookie 失效
	secretFile := filepath.Join(h.Cfg.DataDir, ".jwt_secret")
	if st, err := os.Stat(secretFile); err == nil && !st.IsDir() {
		_ = zipAddFile(zw, secretFile, ".jwt_secret")
	}
}

// BackupRestore 恢复 .zip（完整）或旧版 .db（仅数据库）
func (h *Handler) BackupRestore(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		response.BadRequest(c, "请上传备份文件（.zip 或 .db）")
		return
	}
	name := strings.ToLower(file.Filename)
	tmp := filepath.Join(h.Cfg.DataDir, "restore-upload.tmp")
	if err := c.SaveUploadedFile(file, tmp); err != nil {
		response.ServerError(c, "保存备份文件失败")
		return
	}
	defer os.Remove(tmp)

	sqlDB, err := h.DB.DB()
	if err == nil {
		_ = sqlDB.Close()
	}

	if strings.HasSuffix(name, ".zip") {
		if err := restoreFromZip(tmp, h.Cfg.DataDir, h.Cfg.DBPath); err != nil {
			_ = h.reopenDB()
			response.ServerError(c, "恢复失败："+err.Error())
			return
		}
	} else if strings.HasSuffix(name, ".db") {
		if err := os.Rename(tmp, h.Cfg.DBPath); err != nil {
			// rename 跨盘可能失败，改 copy
			if err2 := copyFile(tmp, h.Cfg.DBPath); err2 != nil {
				_ = h.reopenDB()
				response.ServerError(c, "恢复数据库失败")
				return
			}
		}
		// 清理可能残留的 WAL/SHM
		_ = os.Remove(h.Cfg.DBPath + "-wal")
		_ = os.Remove(h.Cfg.DBPath + "-shm")
	} else {
		_ = h.reopenDB()
		response.BadRequest(c, "仅支持 .zip 完整备份或 .db 数据库备份")
		return
	}

	if err := h.reopenDB(); err != nil {
		response.ServerError(c, "备份已写入，但数据库重连失败，请重启服务："+err.Error())
		return
	}
	h.EnsureSearchEnginesSeeded()

	response.OK(c, gin.H{
		"message": "备份已恢复，数据库连接已重建，请刷新页面",
		"format":  map[bool]string{true: "zip", false: "db"}[strings.HasSuffix(name, ".zip")],
	})
}

func (h *Handler) reopenDB() error {
	db, err := database.Init(h.Cfg.DBPath)
	if err != nil {
		return err
	}
	h.DB = db
	return nil
}

func zipAddFile(zw *zip.Writer, srcPath, zipPath string) error {
	f, err := os.Open(srcPath)
	if err != nil {
		return err
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		return err
	}
	hdr, err := zip.FileInfoHeader(st)
	if err != nil {
		return err
	}
	hdr.Name = zipPath
	hdr.Method = zip.Deflate
	w, err := zw.CreateHeader(hdr)
	if err != nil {
		return err
	}
	_, err = io.Copy(w, f)
	return err
}

func zipAddDir(zw *zip.Writer, dir, prefix string) error {
	st, err := os.Stat(dir)
	if err != nil || !st.IsDir() {
		return nil
	}
	return filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if info.IsDir() {
			return nil
		}
		rel, err := filepath.Rel(dir, path)
		if err != nil {
			return nil
		}
		rel = filepath.ToSlash(rel)
		if strings.Contains(rel, "..") {
			return nil
		}
		return zipAddFile(zw, path, prefix+"/"+rel)
	})
}

func restoreFromZip(zipPath, dataDir, dbPath string) error {
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return err
	}
	defer r.Close()

	tmpDB := filepath.Join(dataDir, "restore-onenav.db.tmp")
	_ = os.Remove(tmpDB)
	hasDB := false

	for _, f := range r.File {
		name := filepath.ToSlash(f.Name)
		name = strings.TrimPrefix(name, "./")
		if name == "" || strings.Contains(name, "..") {
			continue
		}

		var dest string
		switch {
		case name == "onenav.db" || strings.HasSuffix(name, "/onenav.db"):
			dest = tmpDB
			hasDB = true
		case name == ".jwt_secret" || strings.HasSuffix(name, "/.jwt_secret"):
			dest = filepath.Join(dataDir, ".jwt_secret")
		case strings.HasPrefix(name, "uploads/"):
			dest = filepath.Join(dataDir, filepath.FromSlash(name))
		case strings.HasPrefix(name, "themes/"):
			dest = filepath.Join(dataDir, filepath.FromSlash(name))
		default:
			continue
		}

		if f.FileInfo().IsDir() {
			_ = os.MkdirAll(dest, 0o755)
			continue
		}
		if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
			return err
		}
		if err := extractZipFile(f, dest); err != nil {
			return err
		}
	}

	if !hasDB {
		return fmt.Errorf("压缩包内未找到 onenav.db")
	}
	_ = os.Remove(dbPath + "-wal")
	_ = os.Remove(dbPath + "-shm")
	if err := os.Rename(tmpDB, dbPath); err != nil {
		if err2 := copyFile(tmpDB, dbPath); err2 != nil {
			return err2
		}
		_ = os.Remove(tmpDB)
	}
	return nil
}

func extractZipFile(f *zip.File, dest string) error {
	rc, err := f.Open()
	if err != nil {
		return err
	}
	defer rc.Close()
	out, err := os.OpenFile(dest, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, rc)
	return err
}

func (h *Handler) Dashboard(c *gin.Context) {
	var catCount, linkCount, privateLinkCount, publicLinkCount int64
	h.DB.Model(&models.Category{}).Count(&catCount)
	h.DB.Model(&models.Link{}).Count(&linkCount)
	h.DB.Model(&models.Link{}).Where("private = ?", true).Count(&privateLinkCount)
	publicLinkCount = linkCount - privateLinkCount

	var engineCount, engineEnabled int64
	h.DB.Model(&models.SearchEngine{}).Count(&engineCount)
	h.DB.Model(&models.SearchEngine{}).Where("enabled = ?", true).Count(&engineEnabled)

	var setting models.Setting
	_ = h.DB.First(&setting).Error
	themeKey := strings.TrimSpace(setting.Theme)
	if themeKey == "" {
		themeKey = "system"
	}
	themeName := "系统默认"
	if strings.HasPrefix(themeKey, "html:") {
		fsKey := strings.TrimPrefix(themeKey, "html:")
		metaPath := filepath.Join(h.Cfg.DataDir, "themes", fsKey, "theme.json")
		if b, err := os.ReadFile(metaPath); err == nil {
			var meta struct {
				Name string `json:"name"`
			}
			if json.Unmarshal(b, &meta) == nil && strings.TrimSpace(meta.Name) != "" {
				themeName = strings.TrimSpace(meta.Name)
			} else {
				themeName = "自定义 HTML 主题"
			}
		} else {
			themeName = "自定义 HTML 主题"
		}
	}

	type recentLink struct {
		ID         uint   `json:"id"`
		Name       string `json:"name"`
		URL        string `json:"url"`
		Icon       string `json:"icon"`
		IconURL    string `json:"icon_url"`
		Private    bool   `json:"private"`
		CategoryID uint   `json:"category_id"`
		UpdatedAt  string `json:"updated_at"`
	}
	var links []models.Link
	_ = h.DB.Order("updated_at desc, id desc").Limit(8).Find(&links).Error
	recent := make([]recentLink, 0, len(links))
	for _, l := range links {
		recent = append(recent, recentLink{
			ID:         l.ID,
			Name:       l.Name,
			URL:        l.URL,
			Icon:       l.Icon,
			IconURL:    l.IconURL,
			Private:    l.Private,
			CategoryID: l.CategoryID,
			UpdatedAt:  l.UpdatedAt.Format("2006-01-02 15:04"),
		})
	}

	response.OK(c, gin.H{
		"category_count":        catCount,
		"link_count":            linkCount,
		"private_link_count":    privateLinkCount,
		"public_link_count":     publicLinkCount,
		"search_engine_count":   engineCount,
		"search_engine_enabled": engineEnabled,
		"site_title":            setting.SiteTitle,
		"site_subtitle":         setting.SiteSubtitle,
		"theme":                 themeKey,
		"theme_name":            themeName,
		"bg_image_mode":         setting.BgImageMode,
		"search_enabled":        setting.SearchEnabled,
		"recent_links":          recent,
		"version":               h.Cfg.Version,
	})
}
