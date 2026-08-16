# Viewer behavior and boundaries

PortalのBrowser ViewerはGoogle Driveの `/preview` endpointを使用します。

- Microsoft Office fileのDrive Previewを使用する。
- Google Slidesへの変換は行わない。
- OriginalのDrive権限を変更しない。
- OriginalをPublic化しない。
- Previewが利用できない場合でもOriginalの権限・保存状態は変更しない。

Google DriveのPreviewはHuman閲覧用であり、表示はOriginalと完全なpixel parityを保証しません。AI grounding / factual verificationでは引き続きCanonical Originalを参照します。
