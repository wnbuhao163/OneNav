package router

import (
	"net/http"
	"onenav/internal/config"
	"onenav/internal/database"
	"onenav/internal/handlers"
	"onenav/internal/middleware"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func Setup(db *gorm.DB, cfg *config.Config) *gin.Engine {
	r := gin.New()
	r.Use(gin.Logger(), gin.Recovery(), cors(cfg))
	r.MaxMultipartMemory = 512 << 20

	h := handlers.New(db, cfg)

	api := r.Group("/api")
	{
		api.GET("/health", func(c *gin.Context) {
			dbOK := database.Ping(h.DB) == nil
			status := http.StatusOK
			msg := "ok"
			if !dbOK {
				status = http.StatusServiceUnavailable
				msg = "database unavailable"
			}
			c.JSON(status, gin.H{
				"code": map[bool]int{true: 0, false: 503}[dbOK],
				"message": msg,
				"data": gin.H{
					"version": cfg.Version,
					"db":      dbOK,
					"time":    time.Now().Format(time.RFC3339),
				},
			})
		})

		initLimit := middleware.RateLimit(8, time.Minute, 5*time.Minute)
		loginLimit := middleware.RateLimit(20, time.Minute, 10*time.Minute)

		initGroup := api.Group("/init")
		{
			initGroup.GET("/status", h.GetInitStatus)
			initGroup.POST("", initLimit, h.Init)
		}

		auth := api.Group("/auth")
		{
			auth.POST("/login", loginLimit, h.Login)
			auth.POST("/logout", h.Logout)
			auth.GET("/me", middleware.AuthRequired(cfg.JWTSecret), h.Me)
		}

		pub := api.Group("/public")
		pub.Use(middleware.OptionalAuth(cfg.JWTSecret))
		{
			pub.GET("/settings", h.PublicSettings)
			pub.GET("/categories", h.PublicCategories)
			pub.GET("/nav", h.PublicNav)
			pub.GET("/bing-wallpaper", h.PublicBingWallpaper)
			pub.GET("/bing-bg", h.PublicBingBg)
		}

		admin := api.Group("/admin")
		admin.Use(middleware.AuthRequired(cfg.JWTSecret))
		{
			admin.GET("/menus", h.AdminMenus)
			admin.GET("/dashboard", h.Dashboard)

			cats := admin.Group("/categories")
			{
				cats.GET("", h.ListCategories)
				cats.GET("/flat", h.ListCategoriesFlat)
				cats.POST("", h.CreateCategory)
				cats.PUT("/:id", h.UpdateCategory)
				cats.DELETE("/:id", h.DeleteCategory)
			}

			links := admin.Group("/links")
			{
				links.GET("", h.ListLinks)
				links.POST("", h.CreateLink)
				links.POST("/fetch-meta", h.FetchLinkMeta)
				links.POST("/suggest-category", h.SuggestLinkCategory)
				links.POST("/batch-category", h.BatchMoveLinks)
				links.PUT("/:id", h.UpdateLink)
				links.DELETE("/:id", h.DeleteLink)
			}

			admin.POST("/bookmark/import", h.ImportBookmarks)
			admin.POST("/upload", h.UploadIcon)
			admin.POST("/upload/bg", h.UploadBackground)

			docker := admin.Group("/docker")
			{
				docker.GET("/containers", h.ListDockerContainers)
				docker.POST("/import", h.ImportDockerContainers)
			}

			settings := admin.Group("/settings")
			{
				settings.GET("", h.GetSettings)
				settings.PUT("", h.UpdateSettings)
			}

			engines := admin.Group("/search-engines")
			{
				engines.GET("", h.ListAdminSearchEngines)
				engines.POST("", h.CreateSearchEngine)
				engines.PUT("/:id", h.UpdateSearchEngine)
				engines.DELETE("/:id", h.DeleteSearchEngine)
			}

			themes := admin.Group("/themes")
			{
				themes.GET("", h.ListThemes)
				themes.GET("/guide", h.ThemeGuide)
				themes.POST("/apply", h.ApplyTheme)
				themes.POST("/upload", h.UploadHtmlTheme)
				themes.DELETE("/:key", h.DeleteHtmlTheme)
			}

			backup := admin.Group("/backup")
			{
				backup.GET("/export", h.BackupExport)
				backup.POST("/restore", h.BackupRestore)
			}
		}
	}

	_ = os.MkdirAll(filepath.Join(cfg.DataDir, "uploads"), 0o755)
	_ = os.MkdirAll(filepath.Join(cfg.DataDir, "themes"), 0o755)
	r.Static("/uploads", filepath.Join(cfg.DataDir, "uploads"))
	r.Static("/themes", filepath.Join(cfg.DataDir, "themes"))

	r.GET("/", h.ServeFrontend)

	staticDir := cfg.StaticDir
	if info, err := os.Stat(staticDir); err == nil && info.IsDir() {
		r.Static("/assets", filepath.Join(staticDir, "assets"))
		r.StaticFile("/vite.svg", filepath.Join(staticDir, "vite.svg"))
		r.NoRoute(func(c *gin.Context) {
			path := c.Request.URL.Path
			if strings.HasPrefix(path, "/api") || strings.HasPrefix(path, "/uploads") || strings.HasPrefix(path, "/themes") {
				c.JSON(404, gin.H{"code": 404, "message": "接口不存在"})
				return
			}
			candidate := filepath.Join(staticDir, path)
			if !strings.Contains(path, "..") {
				if st, err := os.Stat(candidate); err == nil && !st.IsDir() {
					c.File(candidate)
					return
				}
			}
			c.File(filepath.Join(staticDir, "index.html"))
		})
	}

	return r
}

func cors(cfg *config.Config) gin.HandlerFunc {
	allow := map[string]struct{}{}
	for _, o := range cfg.CORSOrigins {
		allow[o] = struct{}{}
	}
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if origin != "" {
			if len(allow) == 0 {
				// 未配置白名单：开发友好，仅反射本机常见源；生产请设 ONENAV_CORS_ORIGINS
				if isLocalDevOrigin(origin) {
					c.Header("Access-Control-Allow-Origin", origin)
					c.Header("Access-Control-Allow-Credentials", "true")
					c.Header("Vary", "Origin")
				}
			} else if _, ok := allow[origin]; ok {
				c.Header("Access-Control-Allow-Origin", origin)
				c.Header("Access-Control-Allow-Credentials", "true")
				c.Header("Vary", "Origin")
			}
		}
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
		c.Header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	}
}

func isLocalDevOrigin(origin string) bool {
	o := strings.ToLower(origin)
	return strings.HasPrefix(o, "http://localhost:") ||
		strings.HasPrefix(o, "http://127.0.0.1:") ||
		strings.HasPrefix(o, "http://[::1]:")
}
