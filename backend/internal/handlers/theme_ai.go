package handlers

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"onenav/internal/models"
	"onenav/internal/response"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const (
	aiHistoryMaxTurns   = 8
	aiHistoryMaxRunes   = 4000
	aiBaseThemeMaxRunes = 80000
	aiUpstreamTimeout   = 180 * time.Second
)

type aiConfigResp struct {
	AiApiBase   string `json:"ai_api_base"`
	AiModel     string `json:"ai_model"`
	AiApiKeySet bool   `json:"ai_api_key_set"`
}

type aiConfigReq struct {
	AiApiBase string `json:"ai_api_base"`
	AiApiKey  string `json:"ai_api_key"` // 空字符串表示不修改已保存的 Key
	AiModel   string `json:"ai_model"`
}

type aiChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type aiGenerateReq struct {
	Message      string          `json:"message" binding:"required"`
	History      []aiChatMessage `json:"history"`
	Name         string          `json:"name"`
	BaseThemeKey string          `json:"base_theme_key"` // html:xxx 或 fs_key，用于微调
	Overwrite    bool            `json:"overwrite"`      // 与 base 同 key 覆盖保存
}

type aiTestReq struct {
	AiApiBase string `json:"ai_api_base"`
	AiApiKey  string `json:"ai_api_key"`
	AiModel   string `json:"ai_model"`
}

type themeValidation struct {
	OK     bool     `json:"ok"`
	Passed []string `json:"passed"`
	Issues []string `json:"issues"`
}

// GetAIConfig 读取 AI 配置（不回传完整 API Key）
func (h *Handler) GetAIConfig(c *gin.Context) {
	var s models.Setting
	if err := h.DB.First(&s).Error; err != nil {
		response.OK(c, aiConfigResp{})
		return
	}
	response.OK(c, aiConfigResp{
		AiApiBase:   strings.TrimSpace(s.AiApiBase),
		AiModel:     strings.TrimSpace(s.AiModel),
		AiApiKeySet: strings.TrimSpace(s.AiApiKey) != "",
	})
}

// UpdateAIConfig 保存用户自备的 OpenAI 兼容接口配置
func (h *Handler) UpdateAIConfig(c *gin.Context) {
	var req aiConfigReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "参数错误")
		return
	}
	s, err := h.ensureSetting()
	if err != nil {
		response.ServerError(c, "初始化设置失败")
		return
	}
	s.AiApiBase = strings.TrimRight(strings.TrimSpace(req.AiApiBase), "/")
	s.AiModel = strings.TrimSpace(req.AiModel)
	if strings.TrimSpace(req.AiApiKey) != "" {
		s.AiApiKey = strings.TrimSpace(req.AiApiKey)
	}
	if err := h.DB.Save(&s).Error; err != nil {
		response.ServerError(c, "保存失败")
		return
	}
	response.OK(c, aiConfigResp{
		AiApiBase:   s.AiApiBase,
		AiModel:     s.AiModel,
		AiApiKeySet: s.AiApiKey != "",
	})
}

// TestAIConfig 测试 OpenAI 兼容接口连通性（可用表单临时值，不必先保存）
func (h *Handler) TestAIConfig(c *gin.Context) {
	var req aiTestReq
	_ = c.ShouldBindJSON(&req)

	var s models.Setting
	_ = h.DB.First(&s).Error

	base := strings.TrimRight(strings.TrimSpace(req.AiApiBase), "/")
	if base == "" {
		base = strings.TrimRight(strings.TrimSpace(s.AiApiBase), "/")
	}
	model := strings.TrimSpace(req.AiModel)
	if model == "" {
		model = strings.TrimSpace(s.AiModel)
	}
	key := strings.TrimSpace(req.AiApiKey)
	if key == "" {
		key = strings.TrimSpace(s.AiApiKey)
	}
	if base == "" || model == "" || key == "" {
		response.BadRequest(c, "请填写 API Base URL、API Key 与模型名后再测试")
		return
	}

	messages := []map[string]string{
		{"role": "user", "content": "Reply with exactly: ok"},
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()
	reply, err := callOpenAICompatible(ctx, base, key, model, messages, false)
	if err != nil {
		response.BadRequest(c, "连通失败："+err.Error())
		return
	}
	response.OK(c, gin.H{
		"ok":    true,
		"reply": truncateRunes(strings.TrimSpace(reply), 120),
		"hint":  "接口可用，模型已响应",
	})
}

// GenerateThemeWithAI 非流式生成（兼容）
func (h *Handler) GenerateThemeWithAI(c *gin.Context) {
	var req aiGenerateReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "请输入主题描述")
		return
	}
	msg := strings.TrimSpace(req.Message)
	if msg == "" {
		response.BadRequest(c, "请输入主题描述")
		return
	}
	s, err := h.requireAISetting()
	if err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	messages, prepErr := h.buildThemeAIMessages(req, msg)
	if prepErr != nil {
		response.BadRequest(c, prepErr.Error())
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), aiUpstreamTimeout)
	defer cancel()
	reply, err := callOpenAICompatible(ctx, s.AiApiBase, s.AiApiKey, s.AiModel, messages, false)
	if err != nil {
		response.BadRequest(c, "调用 AI 失败："+err.Error())
		return
	}
	out, saveErr := h.finalizeAITheme(req, reply)
	if saveErr != nil {
		response.ServerError(c, saveErr.Error())
		return
	}
	response.OK(c, out)
}

// GenerateThemeWithAIStream 流式生成（SSE）
func (h *Handler) GenerateThemeWithAIStream(c *gin.Context) {
	var req aiGenerateReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "请输入主题描述")
		return
	}
	msg := strings.TrimSpace(req.Message)
	if msg == "" {
		response.BadRequest(c, "请输入主题描述")
		return
	}
	s, err := h.requireAISetting()
	if err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	messages, prepErr := h.buildThemeAIMessages(req, msg)
	if prepErr != nil {
		response.BadRequest(c, prepErr.Error())
		return
	}

	c.Writer.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	c.Writer.Header().Set("Cache-Control", "no-cache, no-transform")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Header().Set("X-Accel-Buffering", "no")
	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		response.ServerError(c, "当前环境不支持流式响应")
		return
	}
	writeSSE := func(payload gin.H) {
		b, _ := json.Marshal(payload)
		_, _ = fmt.Fprintf(c.Writer, "data: %s\n\n", b)
		flusher.Flush()
	}

	writeSSE(gin.H{"type": "start"})
	ctx := c.Request.Context()
	reply, err := streamOpenAICompatible(ctx, s.AiApiBase, s.AiApiKey, s.AiModel, messages, func(delta string) {
		writeSSE(gin.H{"type": "delta", "content": delta})
	})
	if err != nil {
		if ctx.Err() != nil {
			writeSSE(gin.H{"type": "error", "message": "已取消"})
			return
		}
		writeSSE(gin.H{"type": "error", "message": err.Error()})
		return
	}

	out, saveErr := h.finalizeAITheme(req, reply)
	if saveErr != nil {
		writeSSE(gin.H{"type": "error", "message": saveErr.Error()})
		return
	}
	out["type"] = "done"
	writeSSE(out)
}

func (h *Handler) requireAISetting() (models.Setting, error) {
	var s models.Setting
	if err := h.DB.First(&s).Error; err != nil ||
		strings.TrimSpace(s.AiApiBase) == "" ||
		strings.TrimSpace(s.AiApiKey) == "" ||
		strings.TrimSpace(s.AiModel) == "" {
		return s, fmt.Errorf("请先配置 API Base URL、API Key 与模型名")
	}
	return s, nil
}

func (h *Handler) buildThemeAIMessages(req aiGenerateReq, msg string) ([]map[string]string, error) {
	messages := []map[string]string{
		{"role": "system", "content": buildThemeAISystemPrompt()},
	}

	if baseHTML, baseName, err := h.loadBaseThemeHTML(req.BaseThemeKey); err != nil {
		return nil, err
	} else if baseHTML != "" {
		messages = append(messages, map[string]string{
			"role": "user",
			"content": fmt.Sprintf(
				"当前需要在已有主题「%s」基础上修改，不要从零重写无关部分。现有 index.html 如下：\n```html\n%s\n```",
				baseName,
				baseHTML,
			),
		})
		messages = append(messages, map[string]string{
			"role":    "assistant",
			"content": "已收到现有主题 HTML。请说明要改的点，我会输出完整更新后的 index.html。",
		})
	}

	for _, m := range compactAIHistory(req.History) {
		messages = append(messages, map[string]string{"role": m.Role, "content": m.Content})
	}
	messages = append(messages, map[string]string{"role": "user", "content": msg})
	return messages, nil
}

func (h *Handler) finalizeAITheme(req aiGenerateReq, reply string) (gin.H, error) {
	html := extractHTMLFromAIReply(reply)
	out := gin.H{
		"reply": reply,
	}
	if html == "" {
		out["theme"] = nil
		out["validation"] = nil
		out["hint"] = "未检测到完整 HTML。可继续补充需求，或点快捷提示「请输出完整 index.html」。"
		return out, nil
	}

	validation := validateGeneratedThemeHTML(html)
	out["validation"] = validation

	name := strings.TrimSpace(req.Name)
	if name == "" {
		name = "AI 主题 " + time.Now().Format("01-02 15:04")
	}
	desc := "由 AI 根据对话生成"
	overwriteKey := ""
	if req.Overwrite {
		overwriteKey = normalizeAIThemeFSKey(req.BaseThemeKey)
	}
	theme, err := h.saveGeneratedHtmlTheme(name, desc, html, overwriteKey)
	if err != nil {
		return nil, fmt.Errorf("主题已生成但保存失败：%s", err.Error())
	}
	out["theme"] = theme
	if validation.OK {
		out["hint"] = "已生成并保存。可预览或一键启用。"
	} else {
		out["hint"] = "已保存，但校验发现缺失项，建议继续对话让 AI 修补。"
	}
	return out, nil
}

func (h *Handler) loadBaseThemeHTML(rawKey string) (html string, name string, err error) {
	fsKey := normalizeAIThemeFSKey(rawKey)
	if fsKey == "" {
		return "", "", nil
	}
	var row models.HtmlTheme
	if err := h.DB.Where("`key` = ?", fsKey).First(&row).Error; err != nil {
		return "", "", fmt.Errorf("要微调的主题不存在")
	}
	path := h.htmlThemeIndexPath(fsKey)
	b, readErr := os.ReadFile(path)
	if readErr != nil {
		return "", "", fmt.Errorf("读取主题文件失败")
	}
	content := string(b)
	if utf8.RuneCountInString(content) > aiBaseThemeMaxRunes {
		content = truncateRunes(content, aiBaseThemeMaxRunes) + "\n<!-- truncated for AI context -->"
	}
	return content, row.Name, nil
}

func normalizeAIThemeFSKey(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	return htmlThemeFSKey(raw)
}

func compactAIHistory(history []aiChatMessage) []aiChatMessage {
	if len(history) == 0 {
		return nil
	}
	if len(history) > aiHistoryMaxTurns {
		history = history[len(history)-aiHistoryMaxTurns:]
	}
	out := make([]aiChatMessage, 0, len(history))
	for _, m := range history {
		role := strings.ToLower(strings.TrimSpace(m.Role))
		content := strings.TrimSpace(m.Content)
		if content == "" || (role != "user" && role != "assistant") {
			continue
		}
		if looksLikeHTMLTheme(content) || utf8.RuneCountInString(content) > aiHistoryMaxRunes {
			if html := extractHTMLFromAIReply(content); html != "" {
				content = fmt.Sprintf("（上一版完整 HTML 已省略，约 %d 字符。若需修改请直接输出新的完整 index.html。）", utf8.RuneCountInString(html))
			} else {
				content = truncateRunes(content, aiHistoryMaxRunes) + "…"
			}
		}
		out = append(out, aiChatMessage{Role: role, Content: content})
	}
	return out
}

func buildThemeAISystemPrompt() string {
	return `你是 OneNav 自定义 HTML 主题工程师。根据用户描述生成可独立运行的单文件前台主题。

输出格式（强制）：
- 一旦可以交付主题，回复中必须包含一个 markdown 的 html 代码块，内含完整 index.html（含 <!DOCTYPE html>…</html>）。
- 可有一句简短说明，但 HTML 必须完整可运行；不要只给片段。
- 信息不足时最多问 1～2 个关键问题，不要长篇闲聊。

硬性技术要求：
1. 同源相对路径请求：GET /api/public/settings 与 GET /api/public/categories，且 credentials: 'include'。
2. 响应结构为 { code, message, data }；分类树在 data.categories，登录态为 data.authed。
3. 页脚：authed===true 显示「管理」链到 /admin，否则显示「登录」链到 /login。
4. 用 Iconify（如 https://code.iconify.design/3/3.1.1/iconify.min.js）渲染 lucide 图标（data-icon="lucide:xxx"）。
5. 必须实现 applyAppearance(settings)，把 primary_color/accent_color/bg_*/text_color/muted_color/bg_image/glass_* /header_opacity 映射到 CSS 变量（--nav-primary 等），以便后台调色生效。
6. site_logo 有值时同步 favicon；document.title 用 site_title。
7. 不要依赖 React/npm；不要写死外域 API；单文件可内联 CSS/JS。
8. 背景：bg_image_mode 为 bing 时 bg_image 已是 /api/public/bing-bg，直接当图片 URL。
9. 搜索优先读 settings.search_engine_list（url 内 {q} 占位）。

推荐骨架要点：Promise.all 拉 settings+categories → applyAppearance → 渲染分类/链接 → Iconify 扫描图标。`
}

func openAIChatEndpoint(baseURL string) string {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if strings.HasSuffix(baseURL, "/chat/completions") {
		return baseURL
	}
	if strings.HasSuffix(baseURL, "/v1") {
		return baseURL + "/chat/completions"
	}
	return baseURL + "/v1/chat/completions"
}

func callOpenAICompatible(ctx context.Context, baseURL, apiKey, model string, messages []map[string]string, stream bool) (string, error) {
	if stream {
		return streamOpenAICompatible(ctx, baseURL, apiKey, model, messages, nil)
	}
	body, _ := json.Marshal(map[string]interface{}{
		"model":       model,
		"messages":    messages,
		"temperature": 0.35,
		"stream":      false,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, openAIChatEndpoint(baseURL), bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)

	client := &http.Client{Timeout: aiUpstreamTimeout}
	res, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(res.Body, 8<<20))
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return "", fmt.Errorf("%s", extractAIErrorMessage(raw, res.Status))
	}
	var parsed struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return "", fmt.Errorf("解析 AI 响应失败")
	}
	if parsed.Error != nil && parsed.Error.Message != "" {
		return "", fmt.Errorf("%s", parsed.Error.Message)
	}
	if len(parsed.Choices) == 0 || strings.TrimSpace(parsed.Choices[0].Message.Content) == "" {
		return "", fmt.Errorf("AI 未返回内容")
	}
	return parsed.Choices[0].Message.Content, nil
}

func streamOpenAICompatible(
	ctx context.Context,
	baseURL, apiKey, model string,
	messages []map[string]string,
	onDelta func(string),
) (string, error) {
	body, _ := json.Marshal(map[string]interface{}{
		"model":       model,
		"messages":    messages,
		"temperature": 0.35,
		"stream":      true,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, openAIChatEndpoint(baseURL), bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Accept", "text/event-stream")

	client := &http.Client{Timeout: aiUpstreamTimeout}
	res, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()

	if res.StatusCode < 200 || res.StatusCode >= 300 {
		raw, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
		return "", fmt.Errorf("%s", extractAIErrorMessage(raw, res.Status))
	}

	// 部分兼容网关忽略 stream，直接返回 JSON
	ct := strings.ToLower(res.Header.Get("Content-Type"))
	if strings.Contains(ct, "application/json") {
		raw, _ := io.ReadAll(io.LimitReader(res.Body, 8<<20))
		var parsed struct {
			Choices []struct {
				Message struct {
					Content string `json:"content"`
				} `json:"message"`
			} `json:"choices"`
			Error *struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		if err := json.Unmarshal(raw, &parsed); err != nil {
			return "", fmt.Errorf("解析 AI 响应失败")
		}
		if parsed.Error != nil && parsed.Error.Message != "" {
			return "", fmt.Errorf("%s", parsed.Error.Message)
		}
		if len(parsed.Choices) == 0 {
			return "", fmt.Errorf("AI 未返回内容")
		}
		content := parsed.Choices[0].Message.Content
		if onDelta != nil && content != "" {
			onDelta(content)
		}
		return content, nil
	}

	var full strings.Builder
	scanner := bufio.NewScanner(res.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 2*1024*1024)
	for scanner.Scan() {
		if ctx.Err() != nil {
			return full.String(), ctx.Err()
		}
		line := scanner.Text()
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		payload := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if payload == "" || payload == "[DONE]" {
			if payload == "[DONE]" {
				break
			}
			continue
		}
		var chunk struct {
			Choices []struct {
				Delta struct {
					Content string `json:"content"`
				} `json:"delta"`
				Message struct {
					Content string `json:"content"`
				} `json:"message"`
			} `json:"choices"`
			Error *struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		if err := json.Unmarshal([]byte(payload), &chunk); err != nil {
			continue
		}
		if chunk.Error != nil && chunk.Error.Message != "" {
			return full.String(), fmt.Errorf("%s", chunk.Error.Message)
		}
		if len(chunk.Choices) == 0 {
			continue
		}
		delta := chunk.Choices[0].Delta.Content
		if delta == "" {
			delta = chunk.Choices[0].Message.Content
		}
		if delta == "" {
			continue
		}
		full.WriteString(delta)
		if onDelta != nil {
			onDelta(delta)
		}
	}
	if err := scanner.Err(); err != nil && ctx.Err() == nil {
		return full.String(), err
	}
	out := strings.TrimSpace(full.String())
	if out == "" {
		return "", fmt.Errorf("AI 未返回内容")
	}
	return out, nil
}

func extractAIErrorMessage(raw []byte, fallback string) string {
	var envelope struct {
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
		Message string `json:"message"`
	}
	if err := json.Unmarshal(raw, &envelope); err == nil {
		if envelope.Error != nil && strings.TrimSpace(envelope.Error.Message) != "" {
			return strings.TrimSpace(envelope.Error.Message)
		}
		if strings.TrimSpace(envelope.Message) != "" {
			return strings.TrimSpace(envelope.Message)
		}
	}
	msg := strings.TrimSpace(string(raw))
	if msg == "" {
		return fallback
	}
	if len(msg) > 400 {
		return msg[:400] + "..."
	}
	return msg
}

var (
	htmlFenceRe = regexp.MustCompile("(?is)```(?:html|htm)?\\s*\\n([\\s\\S]*?)```")
	htmlDocRe   = regexp.MustCompile(`(?is)(<!DOCTYPE\s+html[\s\S]*?</html>)`)
)

func extractHTMLFromAIReply(reply string) string {
	reply = strings.TrimSpace(reply)
	if reply == "" {
		return ""
	}
	if m := htmlFenceRe.FindStringSubmatch(reply); len(m) > 1 {
		cand := strings.TrimSpace(m[1])
		if looksLikeHTMLTheme(cand) {
			return cand
		}
	}
	if m := htmlDocRe.FindStringSubmatch(reply); len(m) > 1 {
		return strings.TrimSpace(m[1])
	}
	if looksLikeHTMLTheme(reply) {
		return reply
	}
	return ""
}

func looksLikeHTMLTheme(s string) bool {
	low := strings.ToLower(s)
	return strings.Contains(low, "<html") && strings.Contains(low, "</html>") &&
		(strings.Contains(low, "<!doctype") || strings.Contains(low, "<head") || strings.Contains(low, "<body"))
}

func validateGeneratedThemeHTML(html string) themeValidation {
	low := strings.ToLower(html)
	v := themeValidation{Passed: []string{}, Issues: []string{}}
	check := func(ok bool, pass, issue string) {
		if ok {
			v.Passed = append(v.Passed, pass)
		} else {
			v.Issues = append(v.Issues, issue)
		}
	}
	check(strings.Contains(low, "/api/public/settings"), "调用 settings API", "缺少 /api/public/settings")
	check(strings.Contains(low, "/api/public/categories"), "调用 categories API", "缺少 /api/public/categories")
	check(strings.Contains(low, "credentials"), "带 credentials 请求", "请求未设置 credentials: include")
	check(strings.Contains(low, "applyappearance") || strings.Contains(low, "--nav-primary"), "外观变量/applyAppearance", "缺少 applyAppearance 或 --nav-primary")
	check(strings.Contains(low, "/admin") && strings.Contains(low, "/login"), "管理/登录入口", "缺少 /admin 或 /login 入口")
	check(strings.Contains(low, "iconify") || strings.Contains(low, "data-icon"), "Iconify 图标", "缺少 Iconify / data-icon")
	v.OK = len(v.Issues) == 0
	return v
}

func (h *Handler) saveGeneratedHtmlTheme(name, desc, html, overwriteFSKey string) (gin.H, error) {
	html = strings.TrimSpace(html)
	if !looksLikeHTMLTheme(html) {
		return nil, fmt.Errorf("HTML 内容不完整")
	}

	if overwriteFSKey != "" {
		var row models.HtmlTheme
		if err := h.DB.Where("`key` = ?", overwriteFSKey).First(&row).Error; err != nil {
			return nil, fmt.Errorf("要覆盖的主题不存在")
		}
		dest := h.htmlThemeIndexPath(overwriteFSKey)
		if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
			return nil, err
		}
		if err := os.WriteFile(dest, []byte(html), 0o644); err != nil {
			return nil, err
		}
		if name != "" {
			row.Name = name
		}
		row.Description = desc
		if err := h.DB.Save(&row).Error; err != nil {
			return nil, err
		}
		return gin.H{
			"key":         "html:" + overwriteFSKey,
			"fs_key":      overwriteFSKey,
			"name":        row.Name,
			"description": row.Description,
			"preview_url": h.htmlThemePreviewURL(overwriteFSKey),
			"type":        "html",
			"overwritten": true,
		}, nil
	}

	fsKey := "t_" + strings.ReplaceAll(uuid.NewString(), "-", "")[:12]
	dir := filepath.Join(h.themesRoot(), fsKey)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	dest := filepath.Join(dir, "index.html")
	if err := os.WriteFile(dest, []byte(html), 0o644); err != nil {
		_ = os.RemoveAll(dir)
		return nil, err
	}
	row := models.HtmlTheme{
		Key:         fsKey,
		Name:        name,
		Description: desc,
	}
	if err := h.DB.Create(&row).Error; err != nil {
		_ = os.RemoveAll(dir)
		return nil, err
	}
	return gin.H{
		"key":         "html:" + fsKey,
		"fs_key":      fsKey,
		"name":        name,
		"description": desc,
		"preview_url": h.htmlThemePreviewURL(fsKey),
		"type":        "html",
		"overwritten": false,
	}, nil
}
