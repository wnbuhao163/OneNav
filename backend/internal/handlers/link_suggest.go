package handlers

import (
	"net/url"
	"sort"
	"strings"
	"unicode"

	"onenav/internal/models"
	"onenav/internal/response"

	"github.com/gin-gonic/gin"
)

type categorySuggestion struct {
	CategoryID uint    `json:"category_id"`
	Name       string  `json:"name"`
	Score      float64 `json:"score"`
	Reason     string  `json:"reason"`
}

type catLinkBag struct {
	names []string
	hosts []string
	descs []string
}

// SuggestLinkCategory 根据名称/描述/URL 智能推荐分类（本地规则，无需外部 AI）
func (h *Handler) SuggestLinkCategory(c *gin.Context) {
	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		URL         string `json:"url"`
	}
	_ = c.ShouldBindJSON(&req)

	name := strings.TrimSpace(req.Name)
	desc := strings.TrimSpace(req.Description)
	rawURL := strings.TrimSpace(req.URL)
	if name == "" && desc == "" && rawURL == "" {
		response.BadRequest(c, "请先填写名称、描述或 URL")
		return
	}

	var cats []models.Category
	if err := h.DB.Order("sort desc, id asc").Find(&cats).Error; err != nil {
		response.ServerError(c, "读取分类失败")
		return
	}
	if len(cats) == 0 {
		response.OK(c, gin.H{"suggestions": []categorySuggestion{}, "message": "暂无分类，请先创建分类"})
		return
	}

	host := extractHost(rawURL)
	queryText := strings.ToLower(strings.Join([]string{name, desc, host, rawURL}, " "))
	tokens := tokenize(queryText)

	linkBag := map[uint]*catLinkBag{}
	var links []models.Link
	_ = h.DB.Select("name", "url", "description", "category_id").Find(&links).Error
	for _, l := range links {
		bag := linkBag[l.CategoryID]
		if bag == nil {
			bag = &catLinkBag{}
			linkBag[l.CategoryID] = bag
		}
		if n := strings.TrimSpace(l.Name); n != "" {
			bag.names = append(bag.names, strings.ToLower(n))
		}
		if d := strings.TrimSpace(l.Description); d != "" {
			bag.descs = append(bag.descs, strings.ToLower(d))
		}
		if hh := extractHost(l.URL); hh != "" {
			bag.hosts = append(bag.hosts, hh)
		}
	}

	suggestions := make([]categorySuggestion, 0, len(cats))
	for _, cat := range cats {
		score, reason := scoreCategory(cat, tokens, queryText, host, linkBag[cat.ID])
		if score < 0.18 {
			continue
		}
		suggestions = append(suggestions, categorySuggestion{
			CategoryID: cat.ID,
			Name:       cat.Name,
			Score:      round2(score),
			Reason:     reason,
		})
	}

	sort.Slice(suggestions, func(i, j int) bool {
		if suggestions[i].Score == suggestions[j].Score {
			return suggestions[i].CategoryID < suggestions[j].CategoryID
		}
		return suggestions[i].Score > suggestions[j].Score
	})
	if len(suggestions) > 5 {
		suggestions = suggestions[:5]
	}

	msg := "已根据名称/描述/URL 与现有链接匹配推荐"
	if len(suggestions) == 0 {
		msg = "暂无明显匹配，请手动选择分类"
	}
	response.OK(c, gin.H{"suggestions": suggestions, "message": msg})
}

func extractHost(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	if !strings.Contains(raw, "://") {
		raw = "https://" + raw
	}
	u, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	host := strings.ToLower(u.Hostname())
	return strings.TrimPrefix(host, "www.")
}

func tokenize(s string) []string {
	s = strings.ToLower(s)
	var (
		out  []string
		cur  strings.Builder
		seen = map[string]struct{}{}
	)
	flush := func() {
		t := strings.TrimSpace(cur.String())
		cur.Reset()
		if t == "" || utf8Len(t) < 2 {
			return
		}
		if _, ok := seen[t]; ok {
			return
		}
		seen[t] = struct{}{}
		out = append(out, t)
	}
	for _, r := range s {
		if unicode.Is(unicode.Han, r) {
			flush()
			ch := string(r)
			if _, ok := seen[ch]; !ok {
				seen[ch] = struct{}{}
				out = append(out, ch)
			}
			continue
		}
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			cur.WriteRune(r)
			continue
		}
		flush()
	}
	flush()

	// 中文双字窗口，提高「开发工具」类短语命中
	runes := []rune(s)
	for i := 0; i+1 < len(runes); i++ {
		if unicode.Is(unicode.Han, runes[i]) && unicode.Is(unicode.Han, runes[i+1]) {
			bi := string(runes[i : i+2])
			if _, ok := seen[bi]; !ok {
				seen[bi] = struct{}{}
				out = append(out, bi)
			}
		}
	}
	return out
}

func utf8Len(s string) int {
	return len([]rune(s))
}

func scoreCategory(cat models.Category, tokens []string, queryText, host string, bag *catLinkBag) (float64, string) {
	catName := strings.TrimSpace(cat.Name)
	catLower := strings.ToLower(catName)
	if catLower == "" {
		return 0, ""
	}

	score := 0.0
	reason := "相关度匹配"

	// 1) 分类名直接命中
	if strings.Contains(queryText, catLower) {
		score += 0.72
		reason = "描述/名称包含分类名"
	} else {
		catTokens := tokenize(catLower)
		hit := 0
		for _, ct := range catTokens {
			for _, t := range tokens {
				if t == ct || (utf8Len(ct) >= 2 && strings.Contains(t, ct)) || (utf8Len(t) >= 2 && strings.Contains(ct, t)) {
					hit++
					break
				}
			}
		}
		if len(catTokens) > 0 {
			ratio := float64(hit) / float64(len(catTokens))
			score += ratio * 0.55
			if ratio >= 0.5 {
				reason = "与分类名关键词相近"
			}
		}
		// 字符重合（短中文名）
		overlap := runeOverlap(queryText, catLower)
		score += overlap * 0.25
	}

	// 2) 同类已有链接：同域名 / 名称相近
	if bag != nil {
		if host != "" {
			for _, hst := range bag.hosts {
				if hst == host || strings.HasSuffix(host, "."+hst) || strings.HasSuffix(hst, "."+host) {
					score += 0.45
					reason = "与该分类下链接同域名"
					break
				}
				// 主域片段
				if sharedDomainHint(host, hst) {
					score += 0.28
					if reason == "相关度匹配" {
						reason = "与该分类下链接域名相近"
					}
					break
				}
			}
		}
		nameHits := 0
		for _, n := range bag.names {
			if nameSimilarity(queryText, n) >= 0.45 {
				nameHits++
			}
		}
		if nameHits > 0 {
			score += minFloat(0.35, float64(nameHits)*0.12)
			if reason == "相关度匹配" {
				reason = "与该分类下链接名称相近"
			}
		}
		for _, d := range bag.descs {
			if nameSimilarity(queryText, d) >= 0.4 {
				score += 0.12
				break
			}
		}
	}

	if score > 1 {
		score = 1
	}
	return score, reason
}

func sharedDomainHint(a, b string) bool {
	as := strings.Split(a, ".")
	bs := strings.Split(b, ".")
	if len(as) < 2 || len(bs) < 2 {
		return false
	}
	return as[len(as)-2] == bs[len(bs)-2] && as[len(as)-2] != ""
}

func runeOverlap(a, b string) float64 {
	ra := []rune(a)
	rb := []rune(b)
	if len(rb) == 0 {
		return 0
	}
	set := map[rune]struct{}{}
	for _, r := range ra {
		if unicode.IsSpace(r) || unicode.IsPunct(r) {
			continue
		}
		set[r] = struct{}{}
	}
	hit := 0
	total := 0
	for _, r := range rb {
		if unicode.IsSpace(r) || unicode.IsPunct(r) {
			continue
		}
		total++
		if _, ok := set[r]; ok {
			hit++
		}
	}
	if total == 0 {
		return 0
	}
	return float64(hit) / float64(total)
}

func nameSimilarity(a, b string) float64 {
	a = strings.ToLower(strings.TrimSpace(a))
	b = strings.ToLower(strings.TrimSpace(b))
	if a == "" || b == "" {
		return 0
	}
	if strings.Contains(a, b) || strings.Contains(b, a) {
		return 0.8
	}
	ta := tokenize(a)
	tb := tokenize(b)
	if len(ta) == 0 || len(tb) == 0 {
		return runeOverlap(a, b)
	}
	set := map[string]struct{}{}
	for _, t := range ta {
		set[t] = struct{}{}
	}
	hit := 0
	for _, t := range tb {
		if _, ok := set[t]; ok {
			hit++
		}
	}
	return float64(hit) / float64(len(tb))
}

func minFloat(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}

func round2(v float64) float64 {
	return float64(int(v*100+0.5)) / 100
}
