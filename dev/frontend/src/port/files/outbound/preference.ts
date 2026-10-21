export interface SidebarPreference {
  read(): boolean;
  write(open: boolean): void;
}
