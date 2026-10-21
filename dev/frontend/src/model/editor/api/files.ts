export interface FileReadRequest {
  path: string;
  save?: false;
}

export interface FileSaveRequest {
  path: string;
  content: string;
  revision: string;
  save: true;
  create?: true;
}
