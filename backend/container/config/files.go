package config

const Limit = 128 * 1024
const MaxCommandInputBytes = 8 * Limit
const WorkspaceRoot = "/workspace"
const CommandLockPath = "/run/lock/scratch-tab.lock"

// The browser matches MissingFile exactly to offer recreating a deleted file.
const MissingFile = "File not found. It may have been deleted or moved."
const UnsavableContent = "Only UTF-8 text up to 128 KiB can be saved."
const FileAlreadyExists = "A file already exists at this path. Reopen it before saving; copy your edits first."
