import { useLayoutEffect } from 'preact/hooks';
import { UPDATE_NOTICE_INTERVAL_MS } from '../config/constants/updates.js';
import type { UpdateNotice } from '../port/updates/inbound/session.js';

export function useUpdateNotice(notice: UpdateNotice): void {
  useLayoutEffect(() => {
    void notice.check();
    const interval = setInterval(() => void notice.check(), UPDATE_NOTICE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [notice]);
}
