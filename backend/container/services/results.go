package services

import (
	"futrx.local/catalog/applications/scratch-tab/backend/container/config"
	"futrx.local/catalog/applications/scratch-tab/backend/container/model"
)

// Public save feedback stays separate from validation and disk publication.
func fail(status int, message string) model.Result {
	return model.Result{Status: status, Error: message}
}

func replacementResult(failure model.SaveFailure, content string) model.Result {
	switch failure {
	case model.SavePreparationFailed:
		return fail(500, "Cannot prepare save.")
	case model.SaveCreationFailed:
		return fail(500, "Cannot create save file.")
	case model.SaveWriteFailed:
		return fail(500, "Cannot write file. Original file was kept.")
	case model.SaveRevisionChanged:
		return fail(409, "File changed during save. Copy your edits and reopen it.")
	case model.SaveDirectoryFailed:
		return fail(500, "Cannot open save directory. Original file was kept.")
	case model.SaveReplacementFailed:
		return fail(500, "Cannot replace file. Original file was kept.")
	}
	return model.Result{Status: 200, Revision: digest([]byte(content))}
}

func creationResult(failure model.SaveFailure, content string) model.Result {
	switch failure {
	case model.SaveFolderMissing:
		return fail(404, "Folder not found. Recreate the folder first; copy your edits.")
	case model.SaveAlreadyExists:
		return fail(409, config.FileAlreadyExists)
	case model.SavePreparationFailed:
		return fail(500, "Cannot prepare save.")
	case model.SaveCreationFailed, model.SaveWriteFailed:
		return fail(500, "Cannot create file.")
	case model.SaveDirectoryFailed, model.SaveReplacementFailed:
		return fail(500, "Cannot create file in its folder.")
	}
	return model.Result{Status: 200, Revision: digest([]byte(content))}
}
