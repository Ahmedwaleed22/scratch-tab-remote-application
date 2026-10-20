import { useUpdateNotice } from '../hooks/useUpdateNotice.js';

export default function UpdateNotice({
  notice,
}: {
  notice: Parameters<typeof useUpdateNotice>[0];
}) {
  useUpdateNotice(notice);
  return null;
}
