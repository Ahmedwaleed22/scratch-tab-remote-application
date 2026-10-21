package main

// Public save feedback stays separate from validation and disk publication.
func fail(status int, message string) Result { return Result{Status: status, Error: message} }

func replacementResult(failure saveFailure, content string) Result {
	switch failure {
	case savePreparationFailed:
		return fail(500, "Cannot prepare save.")
	case saveCreationFailed:
		return fail(500, "Cannot create save file.")
	case saveWriteFailed:
		return fail(500, "Cannot write file. Original file was kept.")
	case saveRevisionChanged:
		return fail(409, "File changed during save. Copy your edits and reopen it.")
	case saveDirectoryFailed:
		return fail(500, "Cannot open save directory. Original file was kept.")
	case saveReplacementFailed:
		return fail(500, "Cannot replace file. Original file was kept.")
	}
	return Result{Status: 200, Revision: digest([]byte(content))}
}

func creationResult(failure saveFailure, content string) Result {
	switch failure {
	case saveFolderMissing:
		return fail(404, "Folder not found. Recreate the folder first; copy your edits.")
	case saveAlreadyExists:
		return fail(409, fileAlreadyExists)
	case savePreparationFailed:
		return fail(500, "Cannot prepare save.")
	case saveCreationFailed, saveWriteFailed:
		return fail(500, "Cannot create file.")
	case saveDirectoryFailed, saveReplacementFailed:
		return fail(500, "Cannot create file in its folder.")
	}
	return Result{Status: 200, Revision: digest([]byte(content))}
}
