package middleware

import (
	"net"
	"net/http"
	"sync"
	"time"

	"onenav/internal/response"

	"github.com/gin-gonic/gin"
)

type visitor struct {
	count    int
	resetAt  time.Time
	blocked  time.Time
}

// RateLimit 简易内存限流（适合单实例 NAS）
func RateLimit(maxPerWindow int, window time.Duration, blockFor time.Duration) gin.HandlerFunc {
	var mu sync.Mutex
	visitors := map[string]*visitor{}

	go func() {
		t := time.NewTicker(5 * time.Minute)
		defer t.Stop()
		for range t.C {
			mu.Lock()
			now := time.Now()
			for k, v := range visitors {
				if now.After(v.resetAt) && now.After(v.blocked) {
					delete(visitors, k)
				}
			}
			mu.Unlock()
		}
	}()

	return func(c *gin.Context) {
		ip := clientIP(c)
		now := time.Now()
		mu.Lock()
		v, ok := visitors[ip]
		if !ok {
			v = &visitor{resetAt: now.Add(window)}
			visitors[ip] = v
		}
		if now.Before(v.blocked) {
			mu.Unlock()
			response.Fail(c, http.StatusTooManyRequests, "请求过于频繁，请稍后再试")
			c.Abort()
			return
		}
		if now.After(v.resetAt) {
			v.count = 0
			v.resetAt = now.Add(window)
		}
		v.count++
		if v.count > maxPerWindow {
			v.blocked = now.Add(blockFor)
			mu.Unlock()
			response.Fail(c, http.StatusTooManyRequests, "请求过于频繁，请稍后再试")
			c.Abort()
			return
		}
		mu.Unlock()
		c.Next()
	}
}

func clientIP(c *gin.Context) string {
	ip := c.ClientIP()
	if host, _, err := net.SplitHostPort(ip); err == nil {
		return host
	}
	return ip
}
