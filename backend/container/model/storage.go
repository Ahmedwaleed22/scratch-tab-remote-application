package model

import "errors"

var ErrMissing = errors.New("file not found")
var ErrIrregular = errors.New("not a regular file")

type SaveFailure uint8

const (
	SaveSucceeded SaveFailure = iota
	SavePreparationFailed
	SaveCreationFailed
	SaveWriteFailed
	SaveRevisionChanged
	SaveDirectoryFailed
	SaveReplacementFailed
	SaveFolderMissing
	SaveAlreadyExists
)
