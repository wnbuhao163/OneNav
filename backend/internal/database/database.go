package database

import (
	"onenav/internal/models"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func Init(dbPath string) (*gorm.DB, error) {
	// busy_timeout 避免备份/并发写时立即失败；_pragma 由 glebarez 支持
	dsn := dbPath + "?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=foreign_keys(ON)"
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		return nil, err
	}
	sqlDB, err := db.DB()
	if err == nil {
		sqlDB.SetMaxOpenConns(1) // SQLite 单写
	}
	if err := db.AutoMigrate(
		&models.User{},
		&models.Category{},
		&models.Link{},
		&models.Setting{},
		&models.AppMeta{},
		&models.HtmlTheme{},
		&models.SearchEngine{},
	); err != nil {
		return nil, err
	}
	return db, nil
}

func IsInitialized(db *gorm.DB) bool {
	var count int64
	db.Model(&models.User{}).Count(&count)
	return count > 0
}

func Ping(db *gorm.DB) error {
	if db == nil {
		return gorm.ErrInvalidDB
	}
	sqlDB, err := db.DB()
	if err != nil {
		return err
	}
	return sqlDB.Ping()
}
