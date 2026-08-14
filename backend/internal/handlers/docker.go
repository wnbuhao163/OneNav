package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	"onenav/internal/models"
	"onenav/internal/response"

	"github.com/gin-gonic/gin"
)

type dockerContainerView struct {
	ID          string            `json:"id"`
	Name        string            `json:"name"`
	Image       string            `json:"image"`
	State       string            `json:"state"`
	Status      string            `json:"status"`
	Ports       []string          `json:"ports"`
	URL         string            `json:"url"`
	IconURL     string            `json:"icon_url"`
	Description string            `json:"description"`
	Private     bool              `json:"private"`
	Labels      map[string]string `json:"labels"`
	Enabled     bool              `json:"enabled"` // label onenav.enable
	Exists      bool              `json:"exists"`  // 已有同 URL 链接
	Suggested   bool              `json:"suggested"`
}

// ListDockerContainers 扫描本机/远程 Docker 容器，供链接列表导入
func (h *Handler) ListDockerContainers(c *gin.Context) {
	host := strings.TrimSpace(h.Cfg.DockerHost)
	if host == "" {
		response.BadRequest(c, "未配置 Docker。请设置 ONENAV_DOCKER_HOST（如 unix:///var/run/docker.sock），并按需挂载 docker.sock（见 docker-compose 的 docker-import profile）。")
		return
	}
	onlyLabeled := c.Query("only_labeled") == "1" || c.Query("only_labeled") == "true"
	all := c.Query("all") == "1" || c.Query("all") == "true"

	raw, err := dockerAPIGet(host, "/containers/json?all="+strconv.FormatBool(all))
	if err != nil {
		response.BadRequest(c, "无法连接 Docker："+err.Error()+"。请确认已挂载 docker.sock，或设置 ONENAV_DOCKER_HOST。")
		return
	}

	var list []dockerAPIContainer
	if err := json.Unmarshal(raw, &list); err != nil {
		response.ServerError(c, "解析 Docker 响应失败")
		return
	}

	existingURLs := map[string]struct{}{}
	var links []models.Link
	_ = h.DB.Select("url").Find(&links).Error
	for _, l := range links {
		u := strings.TrimRight(strings.TrimSpace(strings.ToLower(l.URL)), "/")
		if u != "" {
			existingURLs[u] = struct{}{}
		}
	}

	publicHost := strings.TrimSpace(h.Cfg.DockerPublicHost)
	if publicHost == "" {
		publicHost = guessPublicHost()
	}

	out := make([]dockerContainerView, 0, len(list))
	for _, item := range list {
		view := mapDockerContainer(item, publicHost)
		if onlyLabeled && !view.Enabled {
			continue
		}
		key := strings.TrimRight(strings.ToLower(view.URL), "/")
		if key != "" {
			_, view.Exists = existingURLs[key]
		}
		view.Suggested = view.URL != "" && !view.Exists && (view.Enabled || len(view.Ports) > 0)
		out = append(out, view)
	}

	sort.Slice(out, func(i, j int) bool {
		if out[i].Suggested != out[j].Suggested {
			return out[i].Suggested
		}
		return out[i].Name < out[j].Name
	})

	response.OK(c, gin.H{
		"list":         out,
		"docker_host":  host,
		"public_host":  publicHost,
		"label_hint":   "可为容器设置标签 onenav.enable=true / onenav.name / onenav.url / onenav.icon / onenav.private",
		"total":        len(out),
	})
}

type dockerImportItem struct {
	Name        string `json:"name"`
	URL         string `json:"url"`
	Description string `json:"description"`
	IconURL     string `json:"icon_url"`
	Private     *bool  `json:"private"`
}

type dockerImportReq struct {
	CategoryID uint              `json:"category_id" binding:"required"`
	Private    bool              `json:"private"`
	Items      []dockerImportItem `json:"items" binding:"required,min=1"`
}

// ImportDockerContainers 将选中的容器批量写入链接列表
func (h *Handler) ImportDockerContainers(c *gin.Context) {
	var req dockerImportReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "请选择分类与至少一个容器")
		return
	}
	var cat models.Category
	if err := h.DB.First(&cat, req.CategoryID).Error; err != nil {
		response.BadRequest(c, "所属分类不存在")
		return
	}

	created := 0
	skipped := 0
	existing := map[string]struct{}{}
	var links []models.Link
	_ = h.DB.Select("url").Find(&links).Error
	for _, l := range links {
		u := strings.TrimRight(strings.ToLower(strings.TrimSpace(l.URL)), "/")
		if u != "" {
			existing[u] = struct{}{}
		}
	}

	for _, item := range req.Items {
		name := strings.TrimSpace(item.Name)
		u := strings.TrimSpace(item.URL)
		if name == "" || u == "" {
			skipped++
			continue
		}
		norm := strings.TrimRight(strings.ToLower(u), "/")
		if _, ok := existing[norm]; ok {
			skipped++
			continue
		}
		priv := req.Private
		if item.Private != nil {
			priv = *item.Private
		}
		link := models.Link{
			Name:        name,
			URL:         u,
			Description: strings.TrimSpace(item.Description),
			IconURL:     strings.TrimSpace(item.IconURL),
			CategoryID:  req.CategoryID,
			Private:     priv,
			Weight:      0,
		}
		if err := h.DB.Create(&link).Error; err != nil {
			skipped++
			continue
		}
		existing[norm] = struct{}{}
		created++
	}

	response.OK(c, gin.H{
		"created": created,
		"skipped": skipped,
		"message": fmt.Sprintf("已添加 %d 条，跳过 %d 条（重复或无效）", created, skipped),
	})
}

// ---------- Docker API helpers ----------

type dockerAPIContainer struct {
	ID      string            `json:"Id"`
	Names   []string          `json:"Names"`
	Image   string            `json:"Image"`
	State   string            `json:"State"`
	Status  string            `json:"Status"`
	Labels  map[string]string `json:"Labels"`
	Ports   []dockerAPIPort   `json:"Ports"`
}

type dockerAPIPort struct {
	IP          string `json:"IP"`
	PrivatePort int    `json:"PrivatePort"`
	PublicPort  int    `json:"PublicPort"`
	Type        string `json:"Type"`
}

func mapDockerContainer(item dockerAPIContainer, publicHost string) dockerContainerView {
	name := ""
	if len(item.Names) > 0 {
		name = strings.TrimPrefix(item.Names[0], "/")
	}
	labels := item.Labels
	if labels == nil {
		labels = map[string]string{}
	}
	enabled := isTruthy(labels["onenav.enable"]) || isTruthy(labels["onenav.discover"])
	if v := strings.TrimSpace(labels["onenav.name"]); v != "" {
		name = v
	}
	if name == "" {
		name = shortID(item.ID)
	}

	ports := make([]string, 0, len(item.Ports))
	var firstPublic int
	for _, p := range item.Ports {
		if p.PublicPort <= 0 {
			continue
		}
		proto := p.Type
		if proto == "" {
			proto = "tcp"
		}
		ports = append(ports, fmt.Sprintf("%d:%d/%s", p.PublicPort, p.PrivatePort, proto))
		if firstPublic == 0 && (proto == "tcp" || proto == "") {
			firstPublic = p.PublicPort
		}
	}
	sort.Strings(ports)

	urlStr := strings.TrimSpace(labels["onenav.url"])
	if urlStr == "" && firstPublic > 0 && publicHost != "" {
		scheme := "http"
		if firstPublic == 443 {
			scheme = "https"
		}
		urlStr = fmt.Sprintf("%s://%s:%d", scheme, publicHost, firstPublic)
	}

	icon := strings.TrimSpace(labels["onenav.icon"])
	if icon == "" {
		icon = strings.TrimSpace(labels["onenav.icon_url"])
	}
	desc := strings.TrimSpace(labels["onenav.description"])
	if desc == "" {
		desc = fmt.Sprintf("Docker · %s · %s", item.Image, item.Status)
	}
	priv := isTruthy(labels["onenav.private"])

	return dockerContainerView{
		ID:          shortID(item.ID),
		Name:        name,
		Image:       item.Image,
		State:       item.State,
		Status:      item.Status,
		Ports:       ports,
		URL:         urlStr,
		IconURL:     icon,
		Description: desc,
		Private:     priv,
		Labels:      labels,
		Enabled:     enabled,
	}
}

func isTruthy(v string) bool {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}

func shortID(id string) string {
	if len(id) > 12 {
		return id[:12]
	}
	return id
}

func guessPublicHost() string {
	if v := strings.TrimSpace(os.Getenv("ONENAV_DOCKER_PUBLIC_HOST")); v != "" {
		return v
	}
	// 尽力取本机非回环 IPv4，NAS/本机开发可用
	ifaces, err := net.Interfaces()
	if err != nil {
		return "127.0.0.1"
	}
	for _, iface := range ifaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, _ := iface.Addrs()
		for _, a := range addrs {
			var ip net.IP
			switch v := a.(type) {
			case *net.IPNet:
				ip = v.IP
			case *net.IPAddr:
				ip = v.IP
			}
			if ip == nil || ip.IsLoopback() {
				continue
			}
			ip = ip.To4()
			if ip == nil {
				continue
			}
			return ip.String()
		}
	}
	return "127.0.0.1"
}

func dockerAPIGet(dockerHost, path string) ([]byte, error) {
	client, base, err := dockerHTTPClient(dockerHost)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, base+path, nil)
	if err != nil {
		return nil, err
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("Docker API %s", resp.Status)
	}
	return body, nil
}

func dockerHTTPClient(dockerHost string) (*http.Client, string, error) {
	dockerHost = strings.TrimSpace(dockerHost)
	if dockerHost == "" {
		dockerHost = "unix:///var/run/docker.sock"
	}

	transport := &http.Transport{}
	base := "http://docker"

	switch {
	case strings.HasPrefix(dockerHost, "unix://"):
		sock := strings.TrimPrefix(dockerHost, "unix://")
		if _, err := os.Stat(sock); err != nil {
			return nil, "", fmt.Errorf("找不到 Docker socket：%s", sock)
		}
		transport.DialContext = func(ctx context.Context, _, _ string) (net.Conn, error) {
			var d net.Dialer
			return d.DialContext(ctx, "unix", sock)
		}
	case strings.HasPrefix(dockerHost, "tcp://"):
		u := strings.TrimPrefix(dockerHost, "tcp://")
		base = "http://" + u
	case strings.HasPrefix(dockerHost, "http://") || strings.HasPrefix(dockerHost, "https://"):
		base = strings.TrimRight(dockerHost, "/")
	default:
		// 当作 host:port
		base = "http://" + dockerHost
	}

	return &http.Client{Transport: transport, Timeout: 8 * time.Second}, base, nil
}
