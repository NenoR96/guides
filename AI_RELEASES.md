# AI-managed guide releases

The plugin keeps presentation, canonical content, and user progress separate while
letting an AI work with all of them in one HTML file.

## Team workflow

1. Open **Content → HTML → HTML content import**.
2. Select **Download AI working file**.
3. Give the downloaded HTML to the AI together with the requested changes.
4. Keep **Content only (articles and quizzes)** selected and upload the returned HTML.
   Uploading only stages it. Guide and quiz content are selected by default.
5. Review the before/after content details and interactive preview. The preview uses
   the current template and saved control-panel settings, not the uploaded executable HTML.
6. Apply the changes or discard them. Existing publication, premium, icons,
   organization, quiz relationships, translations, and appearance settings are preserved.
   New guides and quizzes publish immediately. New quizzes keep their supplied guide links, which must point to published guides (including guides selected in the same import). New guides without organization placement appear under Other guides; arrange them in the control panel.
7. Use **Developer template release** only for shared HTML/CSS/JavaScript maintenance.
   In that mode content updates are off by default. The existing matched release history
   and restore operations apply to developer releases.

Content-only imports accept guide titles, article HTML, takeaways, reading time and
callouts; quizzes accept titles, introductions, questions, bonus questions and results.
Omitted records are preserved. Neither archive lists nor `published: false` in an
uploaded file change visibility in content mode: publish/unpublish in the control panel.
For developer releases, archive lists must not overlap uploaded record arrays;
unpublished records can also be retained in those arrays.

Each fresh HTML download includes an export ID in its manifest. The control panel
stores SHA-256 fingerprints of that export separately in `guideAuthoring-export-*`
datastore records. Unchanged records in an older export are skipped. Edited records
that conflict with newer content or changed visibility are blocked, both at staging
and immediately before writing. Files without a matching baseline must be downloaded
again and edits reapplied. This is optimistic checking, not a datastore transaction;
avoid simultaneous publishing from multiple editors. Failed imports attempt to undo
only their own writes and preserve subsequent edits from another editor.

The embedded Claude instructions have deliberately not been changed. The content-only
importer enforces the field boundary independently of those instructions.

## Appearance and behavior

The **Design** panel controls background, green/blue
accents, section-title and counter colors, completed-button background, and the
topic-completion achievement popup. Ending-card visibility/text/actions remain under
Content → Organization. Settings are stored alongside translations under
`guideTranslations.appearance` and are applied to the widget, staged preview and
downloaded working HTML. Reopen the widget after saving. Template-specific styling
hooks target the shared guides template; arbitrary third-party shells may need adaptation.

Restoring a release changes the design and canonical content snapshot. It never
changes authenticated appData progress or anonymous device-local progress.

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
await GuidesAPI.setReaderMode(true); // Hide titlebar and navbar while reading; false shows both.
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

The working HTML still contains design and content for offline preview. The normal
upload extracts only allowed content fields; developer mode can replace the template.
In production, canonical datastore
content is injected by `GuidesAPI`; embedded JSON is only authoring and preview
context.

Publishing a contract shell removes the embedded content, release manifest,
standalone preview bootstrap, and AI instructions from the stored HTML. The
release content snapshot is saved separately. Downloading an AI working file
recreates these blocks using current canonical content. Legacy shells retain
their original HTML because they may depend on embedded content.

At developer-release publication time, the control panel reloads the latest live datastore
content. Guides/organization and quizzes are imported only when their respective
staged-release option is selected. Every unselected content type is copied from
that latest live state into the release snapshot, preventing changes made by the
CMS team after staging from being overwritten.

Existing guide IDs (`lesson.slug` in the compatibility schema) and journey IDs are permanent. A title change must not
change its stable ID. Guides omitted from `lessons` are preserved. In developer
releases, intentional archival uses `archivedLessonIds`. Normal content imports
leave archive status to the control panel.

## Shared HTML renderer and country versions

The corrected `guias-interativo.html` builds its guide and quiz catalog from the
complete `GuidesAPI` snapshot. Empty snapshots stay empty; embedded legacy guide
and quiz definitions are not merged back into the catalog. Journey sections and
category arrays control placement and order, while `phaseHighlights` independently
controls age recommendations. Empty groups are hidden. Published guides missing
placement appear under Other guides so a manual addition remains accessible.

The standalone working-file bootstrap filters unpublished records and explicit
archive lists, as does the canonical data path. Staged previews still reflect the
selected guide/organization and quiz update options.

The shell's `#guides-ui-labels` JSON block contains configurable generated labels,
including `inThisGuide` (set to `Dans ce guide` for French). Static page copy remains
editable in the HTML. Guide titles, bodies, category labels, section labels, and
milestones come from content records. This is a localization mechanism, not an
automatic translation of a country file.

When preparing a country release, combine its content with the corrected shell;
uploading an older country HTML also uploads its older JavaScript. An archived
record must be omitted from the uploaded `lessons`/`quizzes` array, with its stable
ID retained in the corresponding archive list. The validator rejects a record
that is both updated and archived in one release.

The shared template is uploaded through the HTML release workflow; changing the
local file or rebuilding the plugin does not replace an already published shell.

## Stored records

- `guideReleaseState`: active release pointer.
- `guideShellRevisions`: immutable HTML shell revisions.
- `guideContentRevisions`: matched content snapshots.
- `guideLessons`: canonical guide records (legacy storage name retained for compatibility).
- `guideQuizzes`: canonical quiz definitions, questions, feedback, and result tiers.
- `guideJourneys`: canonical organization records.
- `guides-compact-catalog-v1-{instanceId}` in appData: Home-readable compact published catalog.
- `guides-reading-progress-v1-{instanceId}-{userId}` in appData: authenticated guide/quiz completion and quiz scores.
- `reading-progress` in userData: read-only legacy migration source; new completion is not written here.
- `interactiveGuideHtml`: legacy compatibility only.

The runtime continues to open legacy HTML when no versioned release exists.
Legacy shells are clearly identified during staging because they do not receive
the safety and persistence guarantees of contract shells.

See `HOME_INTEGRATION.md` for the complete Home contract, refresh points,
migration behavior, privacy limitation, and consumer fallback rules.

Inactive releases can be deleted from Release history. Deletion removes both
the immutable `guideShellRevisions` record and its matching
`guideContentRevisions` snapshot. The active release and user progress cannot
be deleted from this screen.

The first working file downloaded from an existing installation may still be a
legacy shell. Ask the AI to migrate it to shell contract v1, remove direct
BuildFire persistence calls, and use the embedded structured content. The
staging validator will block an incomplete migration.
