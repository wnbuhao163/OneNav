package handlers

import (
	"net/http"
	"onenav/internal/config"
	"onenav/internal/database"
	"onenav/internal/middleware"
	"onenav/internal/models"
	"onenav/internal/response"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type Handler struct {
	DB  *gorm.DB
	Cfg *config.Config
}

func New(db *gorm.DB, cfg *config.Config) *Handler {
	h := &Handler{DB: db, Cfg: cfg}
	h.EnsureSearchEnginesSeeded()
	return h
}

// ---------- Init ----------

type InitReq struct {
	Username string `json:"username" binding:"required,min=2,max=64"`
	Password string `json:"password" binding:"required,min=6,max=128"`
	Title    string `json:"title"`
}

func (h *Handler) GetInitStatus(c *gin.Context) {
	response.OK(c, gin.H{"initialized": database.IsInitialized(h.DB)})
}

func (h *Handler) Init(c *gin.Context) {
	if database.IsInitialized(h.DB) {
		response.BadRequest(c, "系统已初始化，请勿重复操作")
		return
	}
	var req InitReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "请填写有效的用户名和密码（密码至少 6 位）")
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		response.ServerError(c, "密码加密失败")
		return
	}
	user := models.User{Username: req.Username, PasswordHash: string(hash)}
	if err := h.DB.Create(&user).Error; err != nil {
		response.ServerError(c, "创建管理员失败")
		return
	}
	title := req.Title
	if title == "" {
		title = "我的导航"
	}
	setting := models.Setting{
		SiteTitle:       title,
		SiteSubtitle:    "简洁好用的个人导航",
		SiteKeywords:    "导航,书签",
		SiteDescription: "个人导航书签管理系统",
		SearchEnabled:   true,
		SearchDefault:   "baidu",
		SearchEngines:   "baidu,google,bing,alipansou",
		Theme:           "system",
		BgImageMode:     "bing",
		PrimaryColor:    "#3B82F6",
		AccentColor:     "#60A5FA",
		BgColor:         "#EEF3F9",
		BgColorEnd:      "#F8FAFC",
		TextColor:       "#0F172A",
		MutedColor:      "#64748B",
		GlassOpacity:    58,
		GlassBlur:       22,
		GlassSaturate:   160,
		HeaderOpacity:   70,
	}
	_ = h.DB.Create(&setting).Error
	token, _ := middleware.GenerateToken(h.Cfg.JWTSecret, user.ID, user.Username, 72)
	h.setAuthCookie(c, token, 72*3600)
	response.OK(c, gin.H{
		"token": token,
		"user":  gin.H{"id": user.ID, "username": user.Username},
	})
}

// ---------- Auth ----------

type LoginReq struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

func (h *Handler) Login(c *gin.Context) {
	if !database.IsInitialized(h.DB) {
		response.BadRequest(c, "系统尚未初始化")
		return
	}
	var req LoginReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "请输入用户名和密码")
		return
	}
	var user models.User
	if err := h.DB.Where("username = ?", req.Username).First(&user).Error; err != nil {
		response.Unauthorized(c, "用户名或密码错误")
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)) != nil {
		response.Unauthorized(c, "用户名或密码错误")
		return
	}
	token, err := middleware.GenerateToken(h.Cfg.JWTSecret, user.ID, user.Username, 72)
	if err != nil {
		response.ServerError(c, "生成令牌失败")
		return
	}
	h.setAuthCookie(c, token, 72*3600)
	response.OK(c, gin.H{
		"token": token,
		"user":  gin.H{"id": user.ID, "username": user.Username},
	})
}

func (h *Handler) Logout(c *gin.Context) {
	h.setAuthCookie(c, "", -1)
	response.OK(c, nil)
}

func (h *Handler) setAuthCookie(c *gin.Context, token string, maxAge int) {
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie("onenav_token", token, maxAge, "/", "", h.Cfg.CookieSecure, true)
}

func (h *Handler) Me(c *gin.Context) {
	uid, _ := c.Get("user_id")
	username, _ := c.Get("username")
	response.OK(c, gin.H{"id": uid, "username": username})
}

// ---------- Admin menus ----------

func (h *Handler) AdminMenus(c *gin.Context) {
	menus := []gin.H{
		{"key": "dashboard", "label": "概览", "icon": "DashboardOutlined", "path": "/admin"},
		{"key": "categories", "label": "分类列表", "icon": "AppstoreOutlined", "path": "/admin/categories"},
		{"key": "links", "label": "链接列表", "icon": "LinkOutlined", "path": "/admin/links"},
		{"key": "search-engines", "label": "搜索引擎", "icon": "SearchOutlined", "path": "/admin/search-engines"},
		{"key": "settings", "label": "站点设置", "icon": "SettingOutlined", "path": "/admin/settings"},
		{"key": "themes", "label": "主题列表", "icon": "SkinOutlined", "path": "/admin/themes"},
	}
	response.OK(c, menus)
}
