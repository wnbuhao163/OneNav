package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"onenav/internal/models"
	"onenav/internal/response"

	"github.com/gin-gonic/gin"
)

type bingArchiveResp struct {
	Images []struct {
		URL     string `json:"url"`
		URLBase string `json:"urlbase"`
	} `json:"images"`
}

var (
	bingMu       sync.Mutex
	bingCached   string
	bingCachedAt time.Time
)

const bingCacheTTL = 6 * time.Hour

func normalizeBgImageMode(s *models.Setting) {
	mode := strings.ToLower(strings.TrimSpace(s.BgImageMode))
	switch mode {
	case "bing", "custom", "none":
		s.BgImageMode = mode
	default:
		if strings.TrimSpace(s.BgImage) != "" {
			s.BgImageMode = "custom"
		} else {
			s.BgImageMode = "none"
		}
	}
}

// applyPublicBgImage 仅用于前台响应：Bing 模式解析真实图片 URL，不写回数据库
func applyPublicBgImage(s *models.Setting) {
	normalizeBgImageMode(s)
	switch s.BgImageMode {
	case "bing":
		// 预热缓存；返回同源代理地址，由服务端拉图再输出，避免跳转/防盗链拿错图
		if _, err := fetchBingWallpaper(); err == nil {
			s.BgImage = "/api/public/bing-bg"
		} else {
			s.BgImage = ""
		}
	case "none":
		s.BgImage = ""
	}
}

func fetchBingWallpaper() (string, error) {
	bingMu.Lock()
	defer bingMu.Unlock()
	if bingCached != "" && time.Since(bingCachedAt) < bingCacheTTL {
		return bingCached, nil
	}

	endpoints := []string{
		"https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=zh-CN",
		"https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=zh-CN",
		"https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=en-US",
	}
	var lastErr error
	for _, endpoint := range endpoints {
		url, err := requestBingImage(endpoint)
		if err != nil {
			lastErr = err
			continue
		}
		bingCached = url
		bingCachedAt = time.Now()
		return url, nil
	}
	if lastErr == nil {
		lastErr = fmt.Errorf("empty bing response")
	}
	return "", lastErr
}

func bingHost(endpoint string) string {
	if strings.Contains(endpoint, "cn.bing.com") {
		return "https://cn.bing.com"
	}
	return "https://www.bing.com"
}

func requestBingImage(endpoint string) (string, error) {
	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequest(http.MethodGet, endpoint, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "application/json,text/javascript,*/*;q=0.8")
	req.Header.Set("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")

	res, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return "", fmt.Errorf("bing http %d", res.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if err != nil {
		return "", err
	}
	var parsed bingArchiveResp
	if err := json.Unmarshal(body, &parsed); err != nil {
		return "", err
	}
	if len(parsed.Images) == 0 {
		return "", fmt.Errorf("bing image missing")
	}
	img := parsed.Images[0]
	host := bingHost(endpoint)

	// 优先 urlbase + 分辨率，避免 url 里 rf=LaDigue 等干扰参数
	base := strings.TrimSpace(img.URLBase)
	if base != "" {
		if !strings.HasPrefix(base, "/") {
			base = "/" + base
		}
		return host + base + "_1920x1080.jpg", nil
	}

	raw := strings.TrimSpace(img.URL)
	if raw == "" {
		return "", fmt.Errorf("bing image missing")
	}
	if strings.HasPrefix(raw, "http://") || strings.HasPrefix(raw, "https://") {
		return raw, nil
	}
	if !strings.HasPrefix(raw, "/") {
		raw = "/" + raw
	}
	return host + raw, nil
}

func proxyBingImage(c *gin.Context, imageURL string) error {
	client := &http.Client{
		Timeout: 20 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return fmt.Errorf("too many redirects")
			}
			return nil
		},
	}
	req, err := http.NewRequest(http.MethodGet, imageURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "image/avif,image/webp,image/apng,image/*,*/*;q=0.8")
	req.Header.Set("Referer", "https://www.bing.com/")

	res, err := client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return fmt.Errorf("bing image http %d", res.StatusCode)
	}

	ct := res.Header.Get("Content-Type")
	if ct == "" || !strings.HasPrefix(ct, "image/") {
		ct = "image/jpeg"
	}
	c.Header("Content-Type", ct)
	c.Header("Cache-Control", "public, max-age=3600")
	c.Status(http.StatusOK)
	_, err = io.Copy(c.Writer, io.LimitReader(res.Body, 12<<20))
	return err
}

// PublicBingWallpaper 前台/后台预览用：今日 Bing 壁纸直链
func (h *Handler) PublicBingWallpaper(c *gin.Context) {
	url, err := fetchBingWallpaper()
	if err != nil {
		response.ServerError(c, "获取 Bing 壁纸失败")
		return
	}
	response.OK(c, gin.H{"url": url, "proxy": "/api/public/bing-bg"})
}

// PublicBingBg 同源代理输出图片字节（不 302），供 CSS / img 使用
func (h *Handler) PublicBingBg(c *gin.Context) {
	url, err := fetchBingWallpaper()
	if err != nil {
		c.Status(http.StatusBadGateway)
		return
	}
	if err := proxyBingImage(c, url); err != nil {
		c.Status(http.StatusBadGateway)
	}
}
