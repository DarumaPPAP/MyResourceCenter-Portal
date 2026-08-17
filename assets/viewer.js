(() => {
  const params = new URLSearchParams(location.search);
  const fileId = params.get('id') || '';
  const format = (params.get('format') || '').toUpperCase();
  const title = params.get('title') || 'Original Document';
  const sizeBytes = Number(params.get('size')) || 0;
  const config = window.MRCViewerConfig || {};
  const largePdfThresholdBytes = Number(config.largePdfThresholdBytes) || 25 * 1024 * 1024;

  const frame = document.getElementById('viewer-frame');
  const adobeView = document.getElementById('adobe-dc-view');
  const loading = document.getElementById('viewer-loading');
  const loadingTitle = document.getElementById('viewer-loading-title');
  const loadingMessage = document.getElementById('viewer-loading-message');
  const error = document.getElementById('viewer-error');
  const titleElement = document.getElementById('viewer-title');
  const metaElement = document.getElementById('viewer-meta');
  const driveLink = document.getElementById('viewer-drive-link');
  const fullscreenButton = document.getElementById('viewer-fullscreen');

  const formatSize = bytes => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '';
    const mib = bytes / (1024 * 1024);
    return `${mib.toFixed(mib >= 100 ? 0 : 1)} MiB`;
  };

  const hasAdobeClientId = () => {
    const value = String(config.adobeClientId || '').trim();
    return value.length > 0 && !/REPLACE|YOUR_CLIENT_ID/i.test(value);
  };

  const setLoading = (heading, message) => {
    loadingTitle.textContent = heading;
    loadingMessage.textContent = message;
    loading.classList.remove('is-hidden');
  };

  const showError = message => {
    error.textContent = message;
    error.classList.add('is-visible');
  };

  const hideLoading = () => {
    loading.classList.add('is-hidden');
  };

  const showDriveSurface = () => {
    adobeView.classList.add('is-hidden');
    frame.classList.remove('is-hidden');
  };

  const showAdobeSurface = () => {
    frame.classList.add('is-hidden');
    adobeView.classList.remove('is-hidden');
  };

  const loadAdobeSdk = () => {
    if (window.AdobeDC) return Promise.resolve();

    return new Promise((resolve, reject) => {
      let settled = false;
      const sdkUrl = String(config.adobeSdkUrl || 'https://acrobatservices.adobe.com/view-sdk/viewer.js');

      const finish = callback => value => {
        if (settled) return;
        settled = true;
        callback(value);
      };

      const resolveOnce = finish(resolve);
      const rejectOnce = finish(reject);
      const onReady = () => resolveOnce();

      document.addEventListener('adobe_dc_view_sdk.ready', onReady, { once: true });

      const existing = document.querySelector('script[data-mrc-adobe-sdk]');
      if (existing) {
        const timeout = window.setTimeout(() => {
          if (window.AdobeDC) resolveOnce();
          else rejectOnce(new Error('Adobe PDF Embed SDK ready timeout'));
        }, 10000);
        existing.addEventListener('load', () => {
          window.clearTimeout(timeout);
          if (window.AdobeDC) resolveOnce();
        }, { once: true });
        existing.addEventListener('error', () => rejectOnce(new Error('Adobe PDF Embed SDK load failed')), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = sdkUrl;
      script.async = true;
      script.dataset.mrcAdobeSdk = 'true';
      script.addEventListener('load', () => {
        if (window.AdobeDC) resolveOnce();
      }, { once: true });
      script.addEventListener('error', () => rejectOnce(new Error('Adobe PDF Embed SDK load failed')), { once: true });
      document.head.appendChild(script);

      window.setTimeout(() => {
        if (window.AdobeDC) resolveOnce();
        else rejectOnce(new Error('Adobe PDF Embed SDK ready timeout'));
      }, 10000);
    });
  };

  titleElement.textContent = title;
  document.title = `${title} | MyResourceCenter`;

  if (!/^[A-Za-z0-9_-]+$/.test(fileId)) {
    loading.classList.add('is-hidden');
    error.textContent = 'Drive file IDが不正です。Documentsへ戻って開き直してください。';
    error.classList.add('is-visible');
    metaElement.textContent = 'Invalid Drive ID';
    return;
  }

  const previewUrl = `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/preview`;
  const originalUrl = `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`;
  const downloadUrl = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
  const sizeLabel = formatSize(sizeBytes);
  const shouldUseAdobe = format === 'PDF' && sizeBytes >= largePdfThresholdBytes;
  let fallbackStarted = false;

  driveLink.href = originalUrl;

  const useDrivePreview = reason => {
    if (fallbackStarted) return;
    fallbackStarted = true;
    showDriveSurface();
    setLoading('Google Drive Previewへ切り替え中', reason || 'Drive Previewを読み込んでいます。');
    metaElement.textContent = `${format || 'DOCUMENT'}${sizeLabel ? ` · ${sizeLabel}` : ''} · Google Drive Preview`;
    frame.src = previewUrl;

    frame.addEventListener('load', () => {
      hideLoading();
    }, { once: true });

    window.setTimeout(() => {
      if (!loading.classList.contains('is-hidden')) {
        showError('読み込みに時間がかかっています。必要なら右上の「Drive Original」から直接開いてください。');
      }
    }, 12000);
  };

  const useAdobePreview = async () => {
    showAdobeSurface();
    setLoading('Adobe PDF Viewerを起動中', '大容量PDFのためAdobe PDF Embed APIへ切り替えています。');
    metaElement.textContent = `PDF${sizeLabel ? ` · ${sizeLabel}` : ''} · Adobe PDF Embed API`;

    if (!hasAdobeClientId()) {
      showError('Adobe PDF Embed APIのClient IDが未設定です。現在はGoogle Drive Previewへフォールバックします。');
      useDrivePreview('Adobe Client ID未設定のためDrive Previewを使用します。');
      return;
    }

    try {
      await loadAdobeSdk();

      const adobeDCView = new window.AdobeDC.View({
        clientId: String(config.adobeClientId).trim(),
        divId: 'adobe-dc-view',
        locale: String(config.adobeLocale || 'ja-JP')
      });

      const eventEnum = window.AdobeDC.View.Enum;
      adobeDCView.registerCallback(
        eventEnum.CallbackType.EVENT_LISTENER,
        event => {
          if (event.type === eventEnum.Events.APP_RENDERING_DONE) {
            hideLoading();
          }
          if (event.type === eventEnum.Events.APP_RENDERING_FAILED) {
            showError('AdobeでのPDF描画に失敗したためGoogle Drive Previewへ切り替えます。');
            useDrivePreview('Adobe PDF Embed APIで描画できなかったためDrive Previewを使用します。');
          }
        },
        {
          listenOn: [eventEnum.Events.APP_RENDERING_DONE, eventEnum.Events.APP_RENDERING_FAILED],
          enableFilePreviewEvents: true
        }
      );

      const fileName = /\.pdf$/i.test(title) ? title : `${title}.pdf`;
      adobeDCView.previewFile(
        {
          content: { location: { url: downloadUrl } },
          metaData: { fileName, hasReadOnlyAccess: true }
        },
        {
          embedMode: 'FULL_WINDOW',
          defaultViewMode: 'FIT_PAGE',
          showAnnotationTools: false,
          showDownloadPDF: true,
          showPrintPDF: true,
          showLeftHandPanel: true,
          showPageControls: true,
          enableLinearization: config.adobeEnableLinearization !== false,
          focusOnRendering: false
        }
      );

      window.setTimeout(() => {
        if (!loading.classList.contains('is-hidden')) {
          showError('Adobe Viewerの初期表示に時間がかかっています。失敗時は自動でDrive Previewへ切り替わります。');
        }
      }, 12000);
    } catch (exception) {
      console.error(exception);
      showError('Adobe PDF Embed APIの初期化に失敗したためGoogle Drive Previewへ切り替えます。');
      useDrivePreview('Adobe Viewerを初期化できなかったためDrive Previewを使用します。');
    }
  };

  if (shouldUseAdobe) {
    useAdobePreview();
  } else {
    useDrivePreview(sizeBytes > 0 ? '通常サイズの資料はGoogle Drive Previewで表示します。' : 'サイズmetadata未登録のためGoogle Drive Previewで表示します。');
  }

  fullscreenButton.addEventListener('click', async () => {
    const target = document.querySelector('.viewer-stage');
    if (!document.fullscreenElement) {
      try { await target.requestFullscreen(); } catch (_) {}
    } else {
      try { await document.exitFullscreen(); } catch (_) {}
    }
  });
})();
