# AI-managed guide releases

The plugin keeps presentation, canonical content, and user progress separate while
letting an AI work with all of them in one HTML file.

## Team workflow

1. Open **Content → HTML → AI release**.
2. Select **Download AI working file**.
3. Give the downloaded HTML to the AI together with the requested changes.
4. Upload the returned HTML. Uploading only stages it.
5. Review the content diff, warnings, and interactive preview.
6. Publish the release or discard it.
7. Use **Release history** to restore one of the five most recent releases.

Restoring a release changes the design and canonical content snapshot. It never
changes the per-user `reading-progress` record.

## Shell contract v1

A protected shell declares:

```html
<meta name="guides-shell-contract" content="1">
```

It obtains production data through the runtime:

```js
const data = await GuidesAPI.getInitialData();
```

The returned object contains:

```js
{
  runtime,
  lessons, // compatibility key containing guides
  quizzes,
  journeyData,
  activeJourney,
  progress: { readGuideIds },
  profile: { babyBirthdate },
  preferences,
  entitlements: { hasSubscriptions, subscriptions },
  currentUser
}
```

Supported writes are deliberately small:

```js
await GuidesAPI.setGuideCompleted(stableLessonId, true);
await GuidesAPI.setQuizCompleted(stableQuizId, true);
await GuidesAPI.setBirthdate("2025-12-10");
await GuidesAPI.savePreference("homeView", "journey");
await GuidesAPI.goBack();
await GuidesAPI.openUrl("https://example.com");
await GuidesAPI.openActionItem({ action: "linkToApp", instanceId: "..." });
await GuidesAPI.openPaywall();
GuidesAPI.onBack(() => showPreviousInternalScreen());
```

Contract shells must not call `buildfire.datastore` or `buildfire.userData`.
They run in a sandboxed iframe, and the permanent widget runtime owns those APIs.
Contract shells must also be self-contained: external scripts and network requests
are blocked by the runtime content-security policy. Images and media may use HTTPS.

## Embedded working content

The downloaded HTML contains two JSON scripts:

```html
<script id="guides-release-manifest" type="application/json">...</script>
<script id="guides-content" type="application/json">...</script>
```

The AI may update design and content in the same file. On upload, the control
panel validates and extracts the content. In production, canonical datastore
content is injected by `GuidesAPI`; embedded JSON is only authoring and preview
context.

Existing guide IDs (`lesson.slug` in the compatibility schema) and journey IDs are permanent. A title change must not
change its stable ID. Guides omitted from `lessons` are preserved. Intentional
archival uses `archivedLessonIds`.

## Stored records

- `guideReleaseState`: active release pointer.
- `guideShellRevisions`: immutable HTML shell revisions.
- `guideContentRevisions`: matched content snapshots.
- `guideLessons`: canonical guide records (legacy storage name retained for compatibility).
- `guideQuizzes`: canonical quiz definitions, questions, feedback, and result tiers.
- `guideJourneys`: canonical organization records.
- `reading-progress`: per-user progress and preferences.
- `interactiveGuideHtml`: legacy compatibility only.

The runtime continues to open legacy HTML when no versioned release exists.
Legacy shells are clearly identified during staging because they do not receive
the safety and persistence guarantees of contract shells.

Inactive releases can be deleted from Release history. Deletion removes both
the immutable `guideShellRevisions` record and its matching
`guideContentRevisions` snapshot. The active release and user progress cannot
be deleted from this screen.

The first working file downloaded from an existing installation may still be a
legacy shell. Ask the AI to migrate it to shell contract v1, remove direct
BuildFire persistence calls, and use the embedded structured content. The
staging validator will block an incomplete migration.
