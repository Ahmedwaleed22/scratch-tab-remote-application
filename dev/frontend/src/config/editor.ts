export const MAX_FILE_BYTES: number = 128 * 1024;
export const FIRST_WINDOW_LAYER: number = 200;
export const MEDIA_OR_ARCHIVE: RegExp =
  /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico|heic|tiff?|mp4|mov|webm|mkv|avi|m4v|mp3|wav|flac|ogg|m4a|aac|pdf|zip|tar|gz|tgz|rar|7z)$/i;

export const UNSUPPORTED_DOCUMENT: RegExp =
  /\.(docx?|docm|dotx?|dotm|xlsx?|xlsm|pptx?|pptm|odt|ods|odp|pages|numbers|key|rtf)$/i;
