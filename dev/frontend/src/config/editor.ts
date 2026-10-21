export const MAX_FILE_BYTES: number = 128 * 1024;
// Matches the container command's response for a path that no longer exists.
export const MISSING_FILE_MESSAGE: string = 'File not found. It may have been deleted or moved.';
export const FIRST_WINDOW_LAYER: number = 200;
export const MEDIA_OR_ARCHIVE: RegExp =
  /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico|heic|tiff?|mp4|mov|webm|mkv|avi|m4v|mp3|wav|flac|ogg|m4a|aac|pdf|zip|tar|gz|tgz|rar|7z)$/i;

export const UNSUPPORTED_DOCUMENT: RegExp =
  /\.(docx?|docm|dotx?|dotm|xlsx?|xlsm|pptx?|pptm|odt|ods|odp|pages|numbers|key|rtf)$/i;
