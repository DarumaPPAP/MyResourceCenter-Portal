(() => {
  const params = new URLSearchParams(location.search);
  const fileId = params.get('id') || '';
  const format = (params.get('format') || '').toUpperCase();
  const title = params.get('title') || 'Original Document';

  const frame = document.getElementById('viewer-frame');
  const loading = document.getElementById('viewer-loading');
  const error = document.getElementById('viewer-error');
  const titleElement = document.getElementById('viewer-title');
  const metaElement = document.getElementById('viewer-meta');
  const driveLink = document.getElementById('viewer-drive-link');
  const fullscreenButton = document.getElementById('viewer-fullscreen');

  titleElement.textContent = title;
  document.title = `${title} | MyResourceCenter`;

  if (!/^[A-Za-z0-9_-]+$/.test(fileId)) {
    loading.classList.add('is-hidden');
    error.textContent = 'Drive file IDが不正です。Documentsへ戻って開き直してください。';
    error.classList.add('is-visible');
    metaElement.textContent = 'Invalid Drive ID';
    return;
  }

  const encodedId = encodeURIComponent(fileId);
  let previewUrl;
  let originalUrl;
  if (format === 'GOOGLE_DOC') {
    previewUrl = `https://docs.google.com/document/d/${encodedId}/preview`;
    originalUrl = `https://docs.google.com/document/d/${encodedId}/edit`;
  } else if (format === 'GOOGLE_SLIDES') {
    previewUrl = `https://docs.google.com/presentation/d/${encodedId}/preview`;
    originalUrl = `https://docs.google.com/presentation/d/${encodedId}/edit`;
  } else {
    previewUrl = `https://drive.google.com/file/d/${encodedId}/preview`;
    originalUrl = `https://drive.google.com/file/d/${encodedId}/view`;
  }

  metaElement.textContent = `${format || 'DOCUMENT'} · Google Preview`;
  driveLink.href = originalUrl;
  frame.src = previewUrl;

  frame.addEventListener('load', () => {
    loading.classList.add('is-hidden');
  }, { once: true });

  window.setTimeout(() => {
    if (!loading.classList.contains('is-hidden')) {
      error.textContent = '読み込みに時間がかかっています。大容量資料はDrive側のPreview生成に時間がかかる場合があります。';
      error.classList.add('is-visible');
    }
  }, 12000);

  fullscreenButton.addEventListener('click', async () => {
    const target = document.querySelector('.viewer-stage');
    if (!document.fullscreenElement) {
      try { await target.requestFullscreen(); } catch (_) {}
    } else {
      try { await document.exitFullscreen(); } catch (_) {}
    }
  });
})();
