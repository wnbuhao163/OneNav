package middleware

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

type Claims struct {
	UserID   uint   `json:"user_id"`
	Username string `json:"username"`
	jwt.RegisteredClaims
}

func GenerateToken(secret string, userID uint, username string, hours int) (string, error) {
	claims := Claims{
		UserID:   userID,
		Username: username,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Duration(hours) * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

func AuthRequired(secret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		claims, err := parseAuth(c, secret)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"code": 401, "message": "未登录或登录已过期"})
			return
		}
		c.Set("user_id", claims.UserID)
		c.Set("username", claims.Username)
		c.Set("authed", true)
		c.Next()
	}
}

// OptionalAuth 解析登录态（若有），不强制登录
func OptionalAuth(secret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		claims, err := parseAuth(c, secret)
		if err == nil {
			c.Set("user_id", claims.UserID)
			c.Set("username", claims.Username)
			c.Set("authed", true)
		} else {
			c.Set("authed", false)
		}
		c.Next()
	}
}

func parseAuth(c *gin.Context, secret string) (*Claims, error) {
	header := c.GetHeader("Authorization")
	tokenStr := ""
	if strings.HasPrefix(header, "Bearer ") {
		tokenStr = strings.TrimPrefix(header, "Bearer ")
	}
	if tokenStr == "" {
		if cookie, err := c.Cookie("onenav_token"); err == nil {
			tokenStr = cookie
		}
	}
	if tokenStr == "" {
		return nil, jwt.ErrTokenMalformed
	}
	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		return []byte(secret), nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, jwt.ErrTokenInvalidClaims
	}
	return claims, nil
}

func IsAuthed(c *gin.Context) bool {
	v, exists := c.Get("authed")
	if !exists {
		return false
	}
	b, ok := v.(bool)
	return ok && b
}
