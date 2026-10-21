import { useUpdateNotice } from '../hooks/useUpdateNotice.js';
import type { UpdateNotice as Notice } from '../port/updates/inbound/session.js';

export default function UpdateNotice({ notice }: { notice: Notice }): null {
  useUpdateNotice(notice);
  return null;
}
