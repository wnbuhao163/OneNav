package config

import (
	"crypto/rand"
	"encoding/hex"
	"log"
	"os"
	"path/filepath"
	"strings"
)

const insecureJWTPlaceholder = "onenav-change-me-in-production"

type Config struct {
	Port             string
	DataDir          string
	DBPath           string
	JWTSecret        string
	StaticDir        string
	DockerHost       string // 空表示未启用 Docker 扫描
	DockerPublicHost string
	CookieSecure     bool
	CORSOrigins      []string // 空 = 仅同源（不反射任意 Origin）
	AllowInsecureJWT bool
	Version          string
}

func Load(version string) *Config {
	dataDir := getenv("ONENAV_DATA", "./data")
	_ = os.MkdirAll(dataDir, 0o755)

	secret, err := resolveJWTSecret(dataDir)
	if err != nil {
		log.Fatalf("JWT secret: %v", err)
	}

	cookieSecure := envBool("ONENAV_COOKIE_SECURE", false)
	// 反代 HTTPS 时可设 ONENAV_COOKIE_SECURE=1

	cfg := &Config{
		Port:             getenv("ONENAV_PORT", "8080"),
		DataDir:          dataDir,
		DBPath:           filepath.Join(dataDir, "onenav.db"),
		JWTSecret:        secret,
		StaticDir:        getenv("ONENAV_STATIC", "./static"),
		DockerHost:       strings.TrimSpace(os.Getenv("ONENAV_DOCKER_HOST")),
		DockerPublicHost: getenv("ONENAV_DOCKER_PUBLIC_HOST", ""),
		CookieSecure:     cookieSecure,
		CORSOrigins:      parseCSV(os.Getenv("ONENAV_CORS_ORIGINS")),
		AllowInsecureJWT: envBool("ONENAV_ALLOW_INSECURE_JWT", false),
		Version:          version,
	}
	return cfg
}

func resolveJWTSecret(dataDir string) (string, error) {
	envSecret := strings.TrimSpace(os.Getenv("ONENAV_JWT_SECRET"))
	allowInsecure := envBool("ONENAV_ALLOW_INSECURE_JWT", false)

	if envSecret != "" && envSecret != insecureJWTPlaceholder && envSecret != "change-me-to-a-long-random-string" {
		if len(envSecret) < 16 {
			return "", errf("ONENAV_JWT_SECRET 过短（至少 16 字符）")
		}
		return envSecret, nil
	}

	if envSecret != "" && !allowInsecure {
		log.Printf("警告: ONENAV_JWT_SECRET 仍为占位值，将改用 data 目录自动生成的密钥")
	}

	secretFile := filepath.Join(dataDir, ".jwt_secret")
	if b, err := os.ReadFile(secretFile); err == nil {
		s := strings.TrimSpace(string(b))
		if len(s) >= 32 {
			return s, nil
		}
	}

	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	s := hex.EncodeToString(buf)
	if err := os.WriteFile(secretFile, []byte(s+"\n"), 0o600); err != nil {
		return "", err
	}
	log.Printf("已生成 JWT 密钥并写入 %s（请勿泄露；备份时建议一并保存）", secretFile)
	return s, nil
}

type simpleError string

func (e simpleError) Error() string { return string(e) }
func errf(msg string) error         { return simpleError(msg) }

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envBool(key string, fallback bool) bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv(key)))
	if v == "" {
		return fallback
	}
	return v == "1" || v == "true" || v == "yes" || v == "on"
}

func parseCSV(s string) []string {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}
