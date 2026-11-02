package config

import "time"

const MaxBackendRequestBytes = 8 * 1024 * 1024
const FileCommandTimeout = 8 * time.Second

const GitCommandTimeout = 90 * time.Second
