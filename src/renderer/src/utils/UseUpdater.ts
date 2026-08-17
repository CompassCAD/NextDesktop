import { useState, useEffect } from 'react'

export default function useUpdater() {
  const [status, setStatus] = useState<'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'> ('idle');
  const [progress, setProgress] = useState(0);
  const [info, setInfo] = useState<any>(null);

  useEffect(() => {
    window.updater.onChecking(() => setStatus('checking'));
    window.updater.onAvailable((_e, i) => { setStatus('available'); setInfo(i); });
    window.updater.onNotAvailable(() => setStatus('not-available'));
    window.updater.onError((_e, msg) => { setStatus('error'); setInfo(msg); });
    window.updater.onProgress((_e, p) => { setStatus('downloading'); setProgress(p.percent); });
    window.updater.onDownloaded((_e, i) => { setStatus('downloaded'); setInfo(i); });
  }, []);

  return {
    status,
    progress,
    info,
    checkForUpdates: () => window.updater.check(),
    // Only call this after the user explicitly consents
    downloadUpdate: () => window.updater.download(),
    previewDownload: () => window.updater.previewDownload(),
    installNow: () => window.updater.install(),
  };
}
