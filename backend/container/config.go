package main

const limit = 128 * 1024
const maxCommandInputBytes = 8 * limit
const workspaceRoot = "/workspace"
const commandLockPath = "/run/lock/scratch-tab.lock"

// The browser matches missingFile exactly to offer recreating a deleted file.
const missingFile = "File not found. It may have been deleted or moved."
const unsavableContent = "Only UTF-8 text up to 128 KiB can be saved."
const fileAlreadyExists = "A file already exists at this path. Reopen it before saving; copy your edits first."
