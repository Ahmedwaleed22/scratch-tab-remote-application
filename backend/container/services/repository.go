package services

import "futrx.local/catalog/applications/scratch-tab/backend/container/model"

type Workspace interface {
	Close()
	Open(string) (File, error)
	Create(string, string) model.SaveFailure
}
type File interface {
	Read() ([]byte, error)
	Replace(string, string) model.SaveFailure
}
type OpenWorkspace func(string) (Workspace, error)
