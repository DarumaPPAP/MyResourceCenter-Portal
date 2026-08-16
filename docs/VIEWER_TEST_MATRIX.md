# Browser Viewer test matrix

| Case | Expected |
|---|---|
| PDF | `viewer.html` -> Drive `/preview` |
| PPTX <= 100MB | `viewer.html` -> Drive `/preview` |
| PPTX > 100MB | `viewer.html` -> Drive `/preview` (Google Slides conversion is not used) |
| Private Drive file | Existing Google account session is used by Drive Preview |
| Desktop | Resource actions remain on the right without overlap |
| Tablet | Resource card actions wrap below metadata |
| Mobile | Resource card becomes one column and action buttons become two equal columns |
| Viewer | Header remains visible and document fills remaining viewport |
| Full Screen | Viewer stage enters browser Fullscreen API |
