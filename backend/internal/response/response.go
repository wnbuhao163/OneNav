package response

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func OK(c *gin.Context, data interface{}) {
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": data})
}

func Fail(c *gin.Context, httpCode int, message string) {
	c.JSON(httpCode, gin.H{"code": httpCode, "message": message, "data": nil})
}

func BadRequest(c *gin.Context, message string) {
	Fail(c, http.StatusBadRequest, message)
}

func Unauthorized(c *gin.Context, message string) {
	Fail(c, http.StatusUnauthorized, message)
}

func NotFound(c *gin.Context, message string) {
	Fail(c, http.StatusNotFound, message)
}

func ServerError(c *gin.Context, message string) {
	Fail(c, http.StatusInternalServerError, message)
}
