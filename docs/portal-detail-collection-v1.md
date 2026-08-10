# Portal Detail / Collection UX v1

PR4はMyResourceCenter-Portalを、一覧から外部/private Sourceへ直接飛ぶ画面ではなく、公開可能なKnowledge metadataを人間が段階的に辿るPortalへ更新する。

## Navigation

```text
Home
 ├─ Documents -> Document Detail
 ├─ Websites  -> Website Detail -> explicit Related Resources
 ├─ Collections -> Reading Guide
 ├─ Taxonomy -> Canonical Domain / Tag / Engine
 └─ Trend Radar
```

## Public Catalog

PortalのCatalog Snapshotはprivate `MyResourceCenter`の`security/public-schema.json`から生成されたallowlist projectionのみを取り込む。

- resources
- websites
- documents
- taxonomy
- relations
- collections
- manifest

`manifest.sourceCommit`で生成元MyResourceCenter Headを追跡する。

## Document Detail

Document Detailは公開metadataのみを表示する。

- DOC ID
- title
- sourceFormat
- level
- engine
- tags
- Canonical Taxonomyとの明示一致

Markdown本文、原資料、画像pathは公開しない。DocumentはResource Relationを直接持たないため、Tag一致を`Related Resources`と呼ばない。

## Website Detail

Website DetailはSource metadataに加え、`relations.json`に明示されたEdgeだけをRelated Resourcesとして表示する。

Tag類似、タイトル類似、AI推測からRelationを生成しない。

Collection所属も`collections.json`に保存された明示membershipのみを表示する。

## Collections

CollectionはHuman向けReading Guide。

- Catalog配列順をReading Orderとして使用
- `foundation / overview / implementation / production-case / optimization / failure-case / research / advanced` Roleを表示
- 空Collectionを低品質・削除候補扱いしない
- Relation NetworkやHealth Scoreとは責務を分離

## Taxonomy

Canonical Domain / Tag / Engine Registryを表示する。

Aliasは探索入口として表示するが、Legacy値を自動Canonical化しない。

## Publication Firewall

`tools/validate_portal.py`で以下をGateする。

- Catalog件数とmanifest一致
- Resource / Website / Document ID整合
- Relation endpoint解決
- Collection member解決
- Review State / Use State分離
- legacy `status / topic`のWebsite公開禁止
- `path / original / images / sourceNote / Evidence / Search Index / Lineage`等のprivate field禁止
- private MyResourceCenter Markdown blobへの直接Link禁止
- legacy `websites-data.json`禁止

PRとPages Deploy直前の両方でValidationする。
