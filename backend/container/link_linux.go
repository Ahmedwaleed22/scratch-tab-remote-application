package main

import (
	"syscall"
	"unsafe"
)

// linkat is absent from package syscall; the raw call keeps the command dependency-free.
func linkat(oldDirectory int, oldName string, newDirectory int, newName string) error {
	from, err := syscall.BytePtrFromString(oldName)
	if err != nil {
		return err
	}
	to, err := syscall.BytePtrFromString(newName)
	if err != nil {
		return err
	}
	_, _, errno := syscall.Syscall6(syscall.SYS_LINKAT, uintptr(oldDirectory), uintptr(unsafe.Pointer(from)), uintptr(newDirectory), uintptr(unsafe.Pointer(to)), 0, 0)
	if errno != 0 {
		return errno
	}
	return nil
}
