export interface Release {
  version: string;
}
export interface Package {
  id: string;
  version: string;
  upgraded?: { error?: string }[];
}
