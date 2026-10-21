export interface UpdateSession {
  checkRelease(): Promise<void>;
  install(): Promise<void>;
}

export interface UpdateNotice {
  check(): Promise<void>;
}
