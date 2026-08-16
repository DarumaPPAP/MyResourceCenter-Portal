# Browser Original Viewer

MyResourceCenter Portalは、登録済みPDF / PPTXをHumanがブラウザ内で閲覧するために `viewer.html` を使用します。

## Routing

```text
Documents
  -> viewer.html?id=<DriveFileId>&format=<PDF|PPTX>
  -> https://drive.google.com/file/d/<DriveFileId>/preview
  -> Google Drive Preview
```

`docs.google.com/presentation/.../edit` をPrimary routeにしません。

Google Slidesへの変換上限と、Google DriveのOffice-file Previewは別の機能です。PortalはOriginalをGoogle Slidesへ変換せず、Drive Previewを埋め込みます。

## Source boundary

- Google Drive Original: factual Source of Truth
- Portal Viewer: Human presentation only
- PortalはOriginalを再圧縮・再エンコード・形式変換しない
- AI groundingはPortal ViewerではなくCanonical Originalへ戻る

## UX contract

- Documents一覧のPrimary actionは `ブラウザで見る`
- `Drive Original` はSecondary action
- DownloadをPrimary navigationにしない
- Desktop / tablet / mobileでActionが重ならないこと
- Viewerは画面全体をDocument表示へ使用し、Full Screenを提供する
