// Service worker registration with an update prompt: a new version never replaces the page mid-reading.
import { useRegisterSW } from "virtual:pwa-register/react";
import { t } from "../strings";

export function UpdateToast() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div className="toast app-chrome" role="status">
      <span>{t.updateReady}</span>
      <button type="button" className="primary" onClick={() => void updateServiceWorker(true)}>
        {t.reload}
      </button>
      <button type="button" className="link-button" onClick={() => setNeedRefresh(false)}>
        {t.later}
      </button>
    </div>
  );
}
