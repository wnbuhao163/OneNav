package models

import "time"

type User struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	Username     string    `gorm:"uniqueIndex;size:64;not null" json:"username"`
	PasswordHash string    `gorm:"size:255;not null" json:"-"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type Category struct {
	ID        uint       `gorm:"primaryKey" json:"id"`
	Name      string     `gorm:"size:128;not null" json:"name"`
	Icon      string     `gorm:"size:128" json:"icon"`
	ParentID  *uint      `gorm:"index" json:"parent_id"`
	Sort      int        `gorm:"default:0" json:"sort"`
	Private   bool       `gorm:"default:false" json:"private"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
	Children  []Category `gorm:"-" json:"children,omitempty"`
	Links     []Link     `gorm:"-" json:"links,omitempty"`
}

type Link struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	URL         string    `gorm:"size:1024;not null" json:"url"`
	BackupURL   string    `gorm:"size:1024" json:"backup_url"`
	Icon        string    `gorm:"size:512" json:"icon"`
	IconURL     string    `gorm:"size:1024" json:"icon_url"`
	Name        string    `gorm:"size:256;not null" json:"name"`
	CategoryID  uint      `gorm:"index;not null" json:"category_id"`
	Weight      int       `gorm:"default:0" json:"weight"`
	Private     bool      `gorm:"default:false" json:"private"`
	Description string    `gorm:"size:1024" json:"description"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type Setting struct {
	ID              uint      `gorm:"primaryKey" json:"id"`
	SiteTitle       string    `gorm:"size:256" json:"site_title"`
	SiteLogo        string    `gorm:"size:1024" json:"site_logo"`
	SiteSubtitle    string    `gorm:"size:512" json:"site_subtitle"`
	SiteKeywords    string    `gorm:"size:512" json:"site_keywords"`
	SiteDescription string    `gorm:"size:1024" json:"site_description"`
	CustomHeader    string    `gorm:"type:text" json:"custom_header"`
	CustomFooter    string    `gorm:"type:text" json:"custom_footer"`
	SearchEnabled   bool      `gorm:"default:true" json:"search_enabled"`
	SearchDefault   string    `gorm:"size:64;default:baidu" json:"search_default"`
	SearchEngines   string    `gorm:"size:512;default:baidu,google,bing" json:"search_engines"`
	Theme           string    `gorm:"size:128;default:system" json:"theme"`
	PrimaryColor    string    `gorm:"size:32;default:#3B82F6" json:"primary_color"`
	AccentColor     string    `gorm:"size:32;default:#60A5FA" json:"accent_color"`
	BgColor         string    `gorm:"size:32;default:#EEF3F9" json:"bg_color"`
	BgColorEnd      string    `gorm:"size:32;default:#F8FAFC" json:"bg_color_end"`
	TextColor       string    `gorm:"size:32;default:#0F172A" json:"text_color"`
	MutedColor      string    `gorm:"size:32;default:#64748B" json:"muted_color"`
	BgImage         string    `gorm:"size:1024" json:"bg_image"`
	BgImageMode     string    `gorm:"size:16;default:none" json:"bg_image_mode"` // none | custom | bing
	GlassOpacity    int       `gorm:"default:58" json:"glass_opacity"`           // 0-100 卡片表面透明度
	GlassBlur       int       `gorm:"default:22" json:"glass_blur"`              // px
	GlassSaturate   int       `gorm:"default:160" json:"glass_saturate"`         // %
	HeaderOpacity   int       `gorm:"default:70" json:"header_opacity"`          // 0-100
	// AI 主题生成（OpenAI 兼容）；Key 仅后台使用，公开接口不返回
	AiApiBase       string    `gorm:"size:512" json:"ai_api_base"`
	AiApiKey        string    `gorm:"size:512" json:"ai_api_key"`
	AiModel         string    `gorm:"size:128" json:"ai_model"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

// SearchEngine 前台搜索引擎（内置可禁用，自定义可增删改）
type SearchEngine struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Key       string    `gorm:"uniqueIndex;size:64;not null" json:"key"`
	Name      string    `gorm:"size:64;not null" json:"name"`
	Group     string    `gorm:"column:engine_group;size:16;not null;index" json:"group"` // web | content | pan
	URL       string    `gorm:"size:1024;not null" json:"url"`                           // 含 {q}
	Enabled   bool      `gorm:"default:true;index" json:"enabled"`
	Builtin   bool      `gorm:"default:false" json:"builtin"`
	Sort      int       `gorm:"default:0;index" json:"sort"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type AppMeta struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Key       string    `gorm:"uniqueIndex;size:64;not null" json:"key"`
	Value     string    `gorm:"type:text" json:"value"`
	UpdatedAt time.Time `json:"updated_at"`
}

// HtmlTheme 用户上传的前台 index.html 主题包
type HtmlTheme struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	Key         string    `gorm:"uniqueIndex;size:64;not null" json:"key"`
	Name        string    `gorm:"size:128;not null" json:"name"`
	Description string    `gorm:"size:512" json:"description"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}
