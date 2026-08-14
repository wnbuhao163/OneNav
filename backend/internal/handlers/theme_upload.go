package handlers

import (
	"archive/zip"
	"encoding/json"
	"io"
	"onenav/internal/models"
	"onenav/internal/response"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

var themeAllowedExt = map[string]bool{
	".html": true, ".htm": true, ".css": true, ".js": true, ".mjs": true, ".map": true,
	".json": true, ".txt": true, ".md": true,
	".png": true, ".jpg": true, ".jpeg": true, ".gif": true, ".webp": true, ".svg": true, ".ico": true,
	".woff": true, ".woff2": true, ".ttf": true, ".otf": true, ".eot": true,
}

type themeMetaFile struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Version     string `json:"version"`
}

func readThemeMeta(dir string) themeMetaFile {
	data, err := os.ReadFile(filepath.Join(dir, "theme.json"))
	if err != nil {
		return themeMetaFile{}
	}
	var meta themeMetaFile
	_ = json.Unmarshal(data, &meta)
	return meta
}

func pathCleanSlash(p string) string {
	p = filepath.ToSlash(filepath.Clean(filepath.FromSlash(p)))
	return strings.TrimPrefix(p, "./")
}

func safeThemeRelPath(name string) (string, bool) {
	name = strings.ReplaceAll(name, "\\", "/")
	name = strings.TrimSpace(name)
	if name == "" || strings.HasPrefix(name, "/") || strings.Contains(name, ":") {
		return "", false
	}
	clean := pathCleanSlash(name)
	if clean == "." || clean == "" || strings.HasPrefix(clean, "../") || clean == ".." {
		return "", false
	}
	if strings.HasSuffix(name, "/") {
		return clean, true
	}
	ext := strings.ToLower(filepath.Ext(clean))
	if ext == "" || !themeAllowedExt[ext] {
		return "", false
	}
	return clean, true
}

func copyFile(src, dest string) error {
	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		return err
	}
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dest, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, in)
	return err
}

func copyDirContents(srcDir, destDir string) error {
	return filepath.Walk(srcDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(srcDir, path)
		if err != nil {
			return err
		}
		if rel == "." {
			return nil
		}
		target := filepath.Join(destDir, rel)
		if info.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		ext := strings.ToLower(filepath.Ext(path))
		if !themeAllowedExt[ext] {
			return nil
		}
		return copyFile(path, target)
	})
}

func findThemeIndex(root string) (string, error) {
	var candidates []string
	_ = filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}
		base := strings.ToLower(info.Name())
		if base == "index.html" || base == "index.htm" {
			candidates = append(candidates, path)
		}
		return nil
	})
	if len(candidates) == 0 {
		return "", os.ErrNotExist
	}
	best := candidates[0]
	bestScore := 1 << 30
	for _, p := range candidates {
		rel, _ := filepath.Rel(root, p)
		depth := strings.Count(filepath.ToSlash(rel), "/")
		score := depth * 10
		if strings.HasSuffix(strings.ToLower(p), ".htm") {
			score++
		}
		if score < bestScore {
			bestScore = score
			best = p
		}
	}
	return best, nil
}

func extractThemeZip(zipPath, destDir string) error {
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return err
	}
	defer r.Close()

	tmpExtract := destDir + "_extract"
	_ = os.RemoveAll(tmpExtract)
	if err := os.MkdirAll(tmpExtract, 0o755); err != nil {
		return err
	}
	defer os.RemoveAll(tmpExtract)

	for _, f := range r.File {
		rel, ok := safeThemeRelPath(f.Name)
		if !ok {
			continue
		}
		target := filepath.Join(tmpExtract, filepath.FromSlash(rel))
		if !strings.HasPrefix(target, filepath.Clean(tmpExtract)+string(os.PathSeparator)) &&
			filepath.Clean(target) != filepath.Clean(tmpExtract) {
			continue
		}
		if f.FileInfo().IsDir() || strings.HasSuffix(f.Name, "/") {
			_ = os.MkdirAll(target, 0o755)
			continue
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return err
		}
		rc, err := f.Open()
		if err != nil {
			return err
		}
		out, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
		if err != nil {
			rc.Close()
			return err
		}
		_, copyErr := io.Copy(out, rc)
		out.Close()
		rc.Close()
		if copyErr != nil {
			return copyErr
		}
	}

	indexPath, err := findThemeIndex(tmpExtract)
	if err != nil {
		return err
	}
	contentRoot := filepath.Dir(indexPath)
	if err := os.MkdirAll(destDir, 0o755); err != nil {
		return err
	}
	if err := copyDirContents(contentRoot, destDir); err != nil {
		return err
	}
	finalIndex := filepath.Join(destDir, "index.html")
	if _, err := os.Stat(finalIndex); err != nil {
		htm := filepath.Join(destDir, "index.htm")
		if _, e2 := os.Stat(htm); e2 == nil {
			_ = os.Rename(htm, finalIndex)
		}
	}
	if _, err := os.Stat(finalIndex); err != nil {
		return os.ErrNotExist
	}
	return nil
}

func (h *Handler) UploadHtmlTheme(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		response.BadRequest(c, "请上传 index.html 或主题 ZIP 包")
		return
	}
	ext := strings.ToLower(filepath.Ext(file.Filename))
	isZip := ext == ".zip"
	isHTML := ext == ".html" || ext == ".htm"
	if !isZip && !isHTML {
		response.BadRequest(c, "仅支持 .html / .htm / .zip")
		return
	}
	maxSize := int64(5 * 1024 * 1024)
	if isZip {
		maxSize = 50 * 1024 * 1024
	}
	if file.Size > maxSize {
		if isZip {
			response.BadRequest(c, "主题 ZIP 不能超过 50MB")
		} else {
			response.BadRequest(c, "主题文件不能超过 5MB")
		}
		return
	}

	formName := strings.TrimSpace(c.PostForm("name"))
	formDesc := strings.TrimSpace(c.PostForm("description"))

	fsKey := "t_" + strings.ReplaceAll(uuid.NewString(), "-", "")[:12]
	dir := filepath.Join(h.themesRoot(), fsKey)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		response.ServerError(c, "创建主题目录失败")
		return
	}

	if isHTML {
		dest := filepath.Join(dir, "index.html")
		if err := c.SaveUploadedFile(file, dest); err != nil {
			_ = os.RemoveAll(dir)
			response.ServerError(c, "保存主题文件失败")
			return
		}
	} else {
		tmpZip := filepath.Join(h.themesRoot(), fsKey+".zip")
		if err := c.SaveUploadedFile(file, tmpZip); err != nil {
			_ = os.RemoveAll(dir)
			response.ServerError(c, "保存 ZIP 失败")
			return
		}
		extractErr := extractThemeZip(tmpZip, dir)
		_ = os.Remove(tmpZip)
		if extractErr != nil {
			_ = os.RemoveAll(dir)
			if os.IsNotExist(extractErr) {
				response.BadRequest(c, "ZIP 中未找到 index.html")
				return
			}
			response.BadRequest(c, "ZIP 解压失败或包含不支持的文件")
			return
		}
	}

	meta := readThemeMeta(dir)
	name := formName
	if name == "" {
		name = strings.TrimSpace(meta.Name)
	}
	if name == "" {
		base := strings.TrimSuffix(filepath.Base(file.Filename), filepath.Ext(file.Filename))
		if base == "" || strings.EqualFold(base, "index") {
			name = "自定义主题 " + time.Now().Format("01-02 15:04")
		} else {
			name = base
		}
	}
	desc := formDesc
	if desc == "" {
		desc = strings.TrimSpace(meta.Description)
	}

	row := models.HtmlTheme{
		Key:         fsKey,
		Name:        name,
		Description: desc,
	}
	if err := h.DB.Create(&row).Error; err != nil {
		_ = os.RemoveAll(dir)
		response.ServerError(c, "保存主题记录失败")
		return
	}

	response.OK(c, gin.H{
		"key":         htmlThemePrefix + fsKey,
		"name":        row.Name,
		"description": row.Description,
		"type":        "html",
		"fs_key":      fsKey,
		"preview_url": h.htmlThemePreviewURL(fsKey),
	})
}
