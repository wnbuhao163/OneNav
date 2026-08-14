package main

import (
	"log"
	"onenav/internal/config"
	"onenav/internal/database"
	"onenav/internal/router"
)

// Version 由构建时 -ldflags 注入，例如 -X main.Version=1.0.0
var Version = "dev"

func main() {
	cfg := config.Load(Version)
	db, err := database.Init(cfg.DBPath)
	if err != nil {
		log.Fatalf("database init failed: %v", err)
	}
	r := router.Setup(db, cfg)
	log.Printf("OneNav %s listening on :%s", cfg.Version, cfg.Port)
	if err := r.Run(":" + cfg.Port); err != nil {
		log.Fatalf("server failed: %v", err)
	}
}
