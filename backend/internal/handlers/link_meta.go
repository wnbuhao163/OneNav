package handlers

import (
	"context"
	"io"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"onenav/internal/response"

	"github.com/gin-gonic/gin"
	"golang.org/x/net/html"
	"golang.org/x/net/html/charset"
)

var httpMetaClient = &http.Client{
	Timeout: 10 * time.Second,
	CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) >= 5 {
			return http.ErrUseLastResponse
		}
		if err := assertPublicURL(req.URL); err != nil {
			return err
		}
		return nil
	},
}

// FetchLinkMeta 根据 URL 识别页面标题与图标
func (h *Handler) FetchLinkMeta(c *gin.Context) {
	var req struct {
		URL string `json:"url" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "请提供有效的 URL")
		return
	}
	raw := strings.TrimSpace(req.URL)
	if raw == "" {
		response.BadRequest(c, "请提供有效的 URL")
		return
	}
	if !strings.Contains(raw, "://") {
		raw = "https://" + raw
	}
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" {
		response.BadRequest(c, "URL 格式不正确")
		return
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		response.BadRequest(c, "仅支持 http / https")
		return
	}
	if err := assertPublicURL(u); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	title, desc, iconURL, pageURL, err := fetchPageMeta(u.String())
	if err != nil {
		// 页面抓取失败时仍尽量返回域名图标，方便用户继续填写
		host := u.Hostname()
		fallbackIcon := faviconFallback(host)
		response.OK(c, gin.H{
			"name":        fallbackName(host),
			"description": "",
			"icon_url":    fallbackIcon,
			"url":         u.String(),
			"partial":     true,
			"message":     "页面读取失败，已回退域名标题与通用图标",
		})
		return
	}

	if title == "" {
		title = fallbackName(u.Hostname())
	}
	if iconURL == "" {
		iconURL = faviconFallback(u.Hostname())
	}

	response.OK(c, gin.H{
		"name":        truncateRunes(title, 128),
		"description": truncateRunes(desc, 500),
		"icon_url":    iconURL,
		"url":         pageURL,
		"partial":     false,
	})
}

func fallbackName(host string) string {
	host = strings.TrimPrefix(strings.ToLower(host), "www.")
	if host == "" {
		return "未命名链接"
	}
	return host
}

func faviconFallback(host string) string {
	host = strings.TrimSpace(host)
	if host == "" {
		return ""
	}
	return "https://www.google.com/s2/favicons?domain=" + url.QueryEscape(host) + "&sz=128"
}

func assertPublicURL(u *url.URL) error {
	host := u.Hostname()
	if host == "" {
		return errBadURL("无效主机名")
	}
	lower := strings.ToLower(host)
	if lower == "localhost" || strings.HasSuffix(lower, ".localhost") || strings.HasSuffix(lower, ".local") {
		return errBadURL("不允许访问本地地址")
	}
	if ip := net.ParseIP(host); ip != nil {
		if !isPublicIP(ip) {
			return errBadURL("不允许访问内网地址")
		}
		return nil
	}
	ips, err := net.LookupIP(host)
	if err != nil || len(ips) == 0 {
		return errBadURL("无法解析域名")
	}
	for _, ip := range ips {
		if !isPublicIP(ip) {
			return errBadURL("不允许访问内网地址")
		}
	}
	return nil
}

type badURLError string

func (e badURLError) Error() string { return string(e) }

func errBadURL(msg string) error { return badURLError(msg) }

func isPublicIP(ip net.IP) bool {
	if ip == nil {
		return false
	}
	if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsMulticast() || ip.IsUnspecified() {
		return false
	}
	// 额外拦截常见云元数据 / 保留段
	if ip4 := ip.To4(); ip4 != nil {
		if ip4[0] == 169 && ip4[1] == 254 {
			return false
		}
		if ip4[0] == 100 && ip4[1] >= 64 && ip4[1] <= 127 { // CGNAT
			return false
		}
	}
	return true
}

func fetchPageMeta(rawURL string) (title, desc, iconURL, finalURL string, err error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return "", "", "", "", err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; OneNavBot/1.0; +https://onenav.local)")
	req.Header.Set("Accept", "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8")
	req.Header.Set("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")

	resp, err := httpMetaClient.Do(req)
	if err != nil {
		return "", "", "", "", err
	}
	defer resp.Body.Close()

	finalURL = rawURL
	if resp.Request != nil && resp.Request.URL != nil {
		finalURL = resp.Request.URL.String()
	}
	base, _ := url.Parse(finalURL)

	ct := resp.Header.Get("Content-Type")
	limited := io.LimitReader(resp.Body, 1<<20) // 1MB
	reader, err := charset.NewReader(limited, ct)
	if err != nil {
		reader = limited
	}
	body, err := io.ReadAll(reader)
	if err != nil {
		return "", "", "", "", err
	}
	htmlStr := string(body)

	title, desc, iconRel := parseHTMLMeta(htmlStr)
	if iconRel != "" && base != nil {
		if abs, e := base.Parse(iconRel); e == nil {
			iconURL = abs.String()
		} else {
			iconURL = iconRel
		}
	}
	if iconURL == "" && base != nil {
		iconURL = base.Scheme + "://" + base.Host + "/favicon.ico"
	}
	return strings.TrimSpace(title), strings.TrimSpace(desc), iconURL, finalURL, nil
}

func parseHTMLMeta(raw string) (title, desc, icon string) {
	doc, err := html.Parse(strings.NewReader(raw))
	if err != nil {
		// 粗略回退
		if m := regexp.MustCompile(`(?is)<title[^>]*>(.*?)</title>`).FindStringSubmatch(raw); len(m) > 1 {
			title = html.UnescapeString(strings.TrimSpace(m[1]))
		}
		return
	}

	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode {
			switch strings.ToLower(n.Data) {
			case "title":
				if title == "" {
					title = textContent(n)
				}
			case "meta":
				name := strings.ToLower(attr(n, "name"))
				prop := strings.ToLower(attr(n, "property"))
				content := strings.TrimSpace(attr(n, "content"))
				if content == "" {
					break
				}
				switch {
				case prop == "og:title" || name == "twitter:title":
					if title == "" || prop == "og:title" {
						title = content
					}
				case prop == "og:description" || name == "description" || name == "twitter:description":
					if desc == "" || prop == "og:description" {
						desc = content
					}
				case prop == "og:image" && icon == "":
					// 仅作次选，优先 favicon
				}
			case "link":
				rel := strings.ToLower(attr(n, "rel"))
				href := strings.TrimSpace(attr(n, "href"))
				if href == "" {
					break
				}
				if strings.Contains(rel, "icon") {
					// apple-touch-icon 通常更清晰，优先保留；否则取第一个 icon
					if icon == "" || strings.Contains(rel, "apple-touch-icon") {
						icon = href
					}
				}
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)
	title = html.UnescapeString(strings.TrimSpace(title))
	desc = html.UnescapeString(strings.TrimSpace(desc))
	return
}

func attr(n *html.Node, key string) string {
	for _, a := range n.Attr {
		if strings.EqualFold(a.Key, key) {
			return a.Val
		}
	}
	return ""
}

func textContent(n *html.Node) string {
	var b strings.Builder
	var walk func(*html.Node)
	walk = func(node *html.Node) {
		if node.Type == html.TextNode {
			b.WriteString(node.Data)
		}
		for c := node.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(n)
	return strings.Join(strings.Fields(b.String()), " ")
}

func truncateRunes(s string, max int) string {
	if max <= 0 || s == "" {
		return s
	}
	if utf8.RuneCountInString(s) <= max {
		return s
	}
	runes := []rune(s)
	return string(runes[:max])
}
