# Home integration contract

Interactive Guides owns both shared documents described here. The Home plugin is a read-only consumer. The integration uses BuildFire `appData`; it does not use background services or cross-plugin messages.

## Tags and identity

Tags are constructed by `shared/guides-home-contract.js`:

- Catalog: `guides-compact-catalog-v1-{instanceId}`
- Progress: `guides-reading-progress-v1-{instanceId}-{userId}`

Each segment is trimmed and percent-encoded. `instanceId` comes from the BuildFire context (`instanceId`, with `pluginInstanceId` accepted as an SDK compatibility alias). `userId` is only the authenticated user's stable `_id`; shell payloads and deep links are never identity sources. A progress tag is not constructed unless both values are present.

Tag separation is a naming convention, not an authorization boundary. BuildFire appData is readable by every plugin and user in the app. The accepted product tradeoff is minimized by publishing only content IDs, completion IDs, and necessary quiz score counters. No name, email, birthdate, profile, entitlement, or subscription data is written to these documents.

## Compact catalog

The catalog is one appData document:

```json
{
  "schemaVersion": 1,
  "sourceInstanceId": "guides-instance-id",
  "revision": 1,
  "updatedAt": "2026-09-18T10:00:00.000Z",
  "items": [
    {
      "id": "stable-guide-or-quiz-id",
      "type": "guide",
      "title": "Display title",
      "minimumAgeMonths": 6,
      "sequence": 12,
      "stage": "6–8 months",
      "published": true
    }
  ]
}
```

`type` is `guide` or `quiz`. Guide IDs are permanent datastore slugs and quiz IDs are permanent quiz IDs. `minimumAgeMonths` is the lowest numeric canonical phase assignment and is `null` for age-independent content. A quiz inherits age and stage metadata from its primary `afterGuideId`/`sourceGuideId`. `stage` is optional display metadata from the canonical journey section title.

`sequence` is a single deterministic, one-based order. Published guides follow the default published journey's section and `lessonIds` order. Each published quiz follows its primary guide, ordered by stable quiz ID when multiple quizzes share an anchor. Published guides missing from the journey follow in stable-ID order, followed by unanchored published quizzes in stable-ID order.

Only published, valid, titled records are emitted. Bodies, questions, release HTML, entitlements, user data, and administrative revision fields are excluded. A generated catalog is saved only when `schemaVersion`, `sourceInstanceId`, or `items` materially change; `updatedAt` and `revision` alone never cause a write.

Catalog synchronization occurs after:

- control-panel initialization, which safely bootstraps existing installations without republishing;
- guide CMS create/update, delete/archive, and JSON import;
- quiz CMS create/update, delete/archive, JSON import, and bundled HTML quiz import;
- journey/organization save, reorder, default change, and delete;
- legacy/full content migration;
- release publication, restoration, and automatic rollback restoration through `applySnapshot`.

The canonical guides, quizzes, journeys, shells, and content revisions remain in plugin datastore. appData is only the compact projection.

## Reading progress

Authenticated progress uses one appData document:

```json
{
  "schemaVersion": 1,
  "sourceInstanceId": "guides-instance-id",
  "userId": "stable-buildfire-user-id",
  "readGuideIds": ["guide-id"],
  "completedQuizIds": ["quiz-id"],
  "quizScores": {
    "quiz-id": { "hits": 4, "total": 5, "plays": 2 }
  },
  "revision": 1,
  "updatedAt": "2026-09-18T10:00:00.000Z",
  "migrationVersion": 1,
  "migratedFromUserDataAt": "2026-09-18T10:00:00.000Z"
}
```

IDs are trimmed, validated against the stable-ID format, and deduplicated. Loaded documents are rejected unless both `sourceInstanceId` and `userId` match the current trusted identities. Completion writes are serialized. Each mutation reloads the latest appData record, applies completion or uncompletion, increments `revision`, stamps `updatedAt`, and saves. `quizScores` is retained because the Guides quiz result UI displays best score and attempt count.

Birthdate, scroll positions, collapsed sections, and view preferences stay in device-local plugin storage. Subscription and profile data are never part of shared progress. Guides no longer writes guide or quiz completion to `userData`.

Anonymous users use the existing device-local guide and quiz completion keys. On login, valid anonymous completion is unioned into the authenticated appData record without removing remote completion. On logout, authenticated in-memory state is cleared and the widget reloads its anonymous device state.

## Legacy migration

For an authenticated user, initialization loads appData first. If `migrationVersion` is below 1, it reads the legacy userData tag `reading-progress`, normalizes `readGuideIds`, `readGuides`, `readLessons`, completed quiz variants, and quiz scores, and unions them into appData. Existing appData wins for an existing quiz score while completion arrays are unioned. It then writes `migrationVersion: 1` and `migratedFromUserDataAt`.

The legacy record is not deleted or modified, allowing rollback. Repeated initialization does not import it again. Unrelated legacy preferences are loaded into their existing local preference path but are not copied into shared appData.

## Navigation

Supported payloads are:

```json
{ "type": "guide", "guideId": "stable-guide-id", "origin": "app-home" }
```

```json
{ "type": "quiz", "quizId": "stable-quiz-id", "origin": "app-home" }
```

`origin` is preserved by runtime normalization. Leaving a Home-opened guide reader or quiz player first shows the Guides landing screen. Existing deep links without `origin: "app-home"` retain their previous navigation behavior.

## Home consumer fallback

Home should treat a missing, malformed, wrong-version, or wrong-`sourceInstanceId` catalog as unavailable and hide the Guides card. It must not attempt to repair or write it. A missing or invalid progress document means no authenticated items are known complete; Home may still select from a valid catalog. A progress document with a wrong `sourceInstanceId` or `userId` must be ignored entirely. Home should also ignore unknown completion IDs and catalog items with unsupported types or invalid stable IDs.
