import { useLayoutEffect } from 'preact/hooks';
import { UPDATE_NOTICE_INTERVAL_MS } from '../config/constants/updates.js';
import type { createUpdateNotice } from '../services/updateNotice.js';

export function useUpdateNotice(notice: ReturnType<typeof createUpdateNotice>) {
  useLayoutEffect(() => {
    void notice.check();
    const interval = setInterval(() => void notice.check(), UPDATE_NOTICE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [notice]);
}
