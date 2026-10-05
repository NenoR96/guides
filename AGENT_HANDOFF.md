# Interactive Guides plugin — agent handoff

Last updated: 2026-09-18 (Europe/Sarajevo)

## Objective

Continue developing and fixing the BuildFire `Interactive Guides [Dev]` plugin. The current work has three connected goals:

1. Publish `guias-interativo-new.html` as a protected shell-contract-v1 release without changing its original visual design.
2. Preserve the new curved SVG journey path and all playable quiz questions.
3. Migrate the quiz definitions into BuildFire datastore safely.

The user considers `guias-interativo-new-original.html` the visual and quiz source of truth.

## What this plugin does

This is a BuildFire learning-content plugin for parents following a baby's food-introduction journey, primarily BLW (Baby-Led Weaning). It combines a guide library, an age-personalized curriculum, progress tracking, and short quizzes in one mobile experience.

The user first enters the baby's birthdate. The plugin calculates the baby's current age and uses it to highlight the most relevant guides for that phase. The complete library remains available, so age personalization changes emphasis and ordering rather than permanently hiding content.

The main user-facing experiences are:

- **Journey view:** a gamified curriculum from preparation through two years and beyond. Guide nodes follow a curved SVG road, and quiz nodes appear as smaller branches attached to their related guide.
- **List view:** the same library presented as compact thematic categories instead of a visual road.
- **Guide reader:** displays the guide title, summary, reading time, key takeaways, formatted article body, references, related guides, completion control, and saved reading position.
- **Quizzes:** scenario-based questions attached to guide topics. They provide immediate explanatory feedback, optional facts, a bonus question, streak/score feedback, a final result tier, and a review of missed answers.
- **Milestones:** age-related summaries explaining what families can expect and remember during a particular phase.
- **Search:** searches guide titles and content, including answer-style snippets extracted from relevant passages.
- **Progress:** remembers completed guides, completed quizzes, quiz best scores/attempts, collapsed journey sections, selected home view, reading position, and baby birthdate.
- **Premium handling:** a guide can be marked premium. Entitlement is checked outside the protected HTML, and a locked guide redirects to the subscription/paywall plugin.

The current dataset contains 32 guides. Guides are organized along two independent axes:

1. **Age journey:** Fundamentals, timeless/practical guides, and age phases such as 6 months, 7 months, through 2+ years.
2. **Thematic list:** categories such as getting started, safety, routines, and related subjects.

A guide has one permanent stable ID (`slug` in datastore and `id` inside the legacy HTML). Titles and content may change, but stable IDs must not change because journey placement, quiz relationships, and user progress all reference them.

## Plugin structure in plain language

The plugin has two BuildFire surfaces:

### Control panel

`control/content/index.html` is the administrator/CMS interface. It manages guides, categories, age placement, journeys, JSON import/export, legacy migration, and AI-managed HTML releases.

The AI release workflow lets an administrator:

1. Download a working HTML file containing the current design plus embedded content context.
2. Give that file to an AI or developer for design/content changes.
3. Upload the returned HTML as a staged release.
4. Review a content diff and interactive preview.
5. Publish or discard it.
6. Restore one of the recent matched design/content snapshots.

Staging does not change the live widget. Publishing should create immutable shell and content revision records, apply the content snapshot, and update `guideReleaseState.activeReleaseId`.

### Widget

`widget/index.html` is the permanent entry point loaded for app users. It starts `widget/release-runtime.js`.

The runtime loads canonical guides, quizzes, journeys, user progress, and the active release pointer. It then chooses one of three rendering paths:

1. **Active protected release:** render the active HTML shell inside a sandboxed iframe and communicate through `GuidesAPI`.
2. **Legacy HTML fallback:** if there is no usable active release, load `interactiveGuideHtml` directly.
3. **Built-in emergency renderer:** if neither custom path can start safely, show a minimal guide list/reader.

The old UI currently visible in the published widget (`3 of 43`, straight road, 11 quizzes) is the legacy fallback. The desired staged UI (`3 of 59`, curved road, 27 quizzes) is the new HTML shell.

## Why the protected shell exists

Historically, the large HTML file owned everything: UI, canonical guide content, BuildFire authentication, datastore/user-data access, commerce, navigation, and progress persistence. That made visual releases powerful but risky because uploaded code could directly access platform APIs and mix content, design, and user state.

Shell-contract v1 separates responsibilities:

```text
Uploaded HTML shell
  owns: layout, styles, screens, rendering, interactions, quiz gameplay

Permanent widget runtime
  owns: BuildFire APIs, canonical datastore content, users, progress,
        subscriptions, paywall navigation, external navigation, active releases
```

The shell receives an initial snapshot through:

```js
const data = await GuidesAPI.getInitialData();
```

It writes only through narrowly scoped methods such as:

```js
await GuidesAPI.setGuideCompleted(guideId, true);
await GuidesAPI.setQuizCompleted(quizId, true);
await GuidesAPI.setBirthdate("2025-12-10");
await GuidesAPI.savePreference("homeViewMode", "journey");
await GuidesAPI.openPaywall();
```

The iframe is sandboxed and receives a restrictive content-security policy. It cannot load external scripts or directly call BuildFire persistence APIs. The runtime validates IDs and data before writing.

## Content, design, and progress are separate

There are three different kinds of state, and fixes must avoid confusing them:

- **Design/shell:** the complete uploaded HTML, CSS, and client-side rendering code stored in `guideShellRevisions`.
- **Canonical content:** guides, quizzes, journey organization, and matched release snapshots stored in plugin datastore.
- **Per-user state:** authenticated reading/quiz progress and quiz scores stored in versioned, instance/user-scoped appData; anonymous completion and private UI/profile preferences remain device-local. `reading-progress` userData is read-only legacy migration input.

Publishing or restoring a release may change design and canonical content. It must never erase or replace per-user progress.

The HTML working file also contains embedded JSON and hardcoded guide/quiz definitions. Embedded data is useful for direct-file preview and gives an AI complete context, but the long-term architecture expects canonical production records to live in datastore. For the current visual-parity fix, the original embedded guide/quiz presentation is deliberately kept as the rendering source because existing quiz datastore records may be incomplete or older.

## Workspace

Plugin root:

```text
C:\Users\User\Desktop\buildfire\sdk\plugins\guides
```

Important files:

```text
guias-interativo.html                  Old legacy HTML currently seen by the published widget
guias-interativo-new-original.html     Untouched source-of-truth HTML supplied by the user
guias-interativo-new.html              Working contract-v1 version intended for upload
control/content/release-manager.js     AI release staging/publishing/history logic
control/content/migrate-existing-content.js
widget/release-runtime.js              Permanent widget runtime and protected-shell bridge
widget/index.html                      Starts release-runtime.js, then falls back to legacy HTML
AI_RELEASES.md                         Release architecture and GuidesAPI documentation
```

The surrounding SDK repository has many unrelated user changes. Do not reset, clean, or modify unrelated files.

## What was found in the new HTML

Compared with `guias-interativo.html`, the original new file contains:

- 27 quizzes instead of 11 placeholders.
- 199 regular questions and 27 bonus questions.
- Full quiz intros, choices, correct-answer indexes, feedback, facts, belonging text, bonus questions, and four result tiers per quiz.
- A dynamically drawn curved SVG journey road (`drawJourneyTrail`) instead of the old straight dashed center line.
- Quiz nodes presented as smaller annexes attached to guide nodes.
- `blw-o-que-e` moved to the first position in Fundamentals and the `tema-comecar` list.
- No added/removed guides and no changes to guide body content or age-phase assignments.

Five existing quiz metadata entries changed: two question counts, two titles, and one multi-guide placement. Sixteen quiz IDs were added.

## Quiz datastore migration

`control/content/migrate-existing-content.js` was extended to migrate quizzes into a dedicated datastore tag:

```text
guideQuizzes
```

Each quiz record includes:

- `schemaVersion`
- stable `id`
- `title`
- `questionCount`
- `afterGuideId`
- `alsoAfterGuideIds`
- `sourceGuideId`
- `intro`
- `questions`
- `bonus`
- `results`
- `published`
- migration metadata

The migration validates duplicate IDs, guide references, question counts, choices, correct-answer indexes, bonus questions, and four result tiers.

Two entry points are exposed in the BuildFire control iframe:

```js
// Quiz-only: does not update guides or journey organization.
await importNewQuizData({ dryRun: true });
await importNewQuizData();

// Full content import: updates guides, quizzes, and journey organization.
await importNewGuideData({ dryRun: true });
await importNewGuideData();
```

A mocked quiz-only dry run passed with 27 quizzes, 199 regular questions, and 27 bonus questions. No live datastore migration was run by the agent.

## Release architecture

Datastore tags used by the release system:

```text
guideLessons
guideQuizzes
guideJourneys
guideReleaseState
guideShellRevisions
guideContentRevisions
guides-compact-catalog-v1-{instanceId}        appData Home projection
guides-reading-progress-v1-{instanceId}-{userId} appData authenticated progress
reading-progress                              read-only legacy userData migration source
interactiveGuideHtml        Legacy fallback only
```

Expected protected-shell flow:

```text
control panel stages HTML
  -> publish inserts shell/content revisions
  -> guideReleaseState.activeReleaseId points to the shell revision
  -> widget/release-runtime.js finds the active shell
  -> runtime renders it in a sandboxed iframe
  -> iframe communicates through GuidesAPI
```

If `activeReleaseId` is absent or its shell revision cannot be found, the widget falls back to `interactiveGuideHtml`, which is the old straight-path/11-quiz version.

## Contract conversion performed

`guias-interativo-new.html` now declares:

```html
<meta name="guides-shell-contract" content="1">
```

The working HTML uses `GuidesAPI` for initial state, guide completion, quiz completion, birthdate, preferences, back navigation, external links, and paywall navigation. Static checks showed:

- shell JavaScript parses successfully;
- contract marker is present;
- no external scripts;
- no direct `buildfire.datastore` or `buildfire.userData` access in the executable shell;
- no direct BuildFire calls in the executable shell;
- file is about 2.97 MB, below the release manager's 4 MB limit.

`widget/release-runtime.js` was updated to:

- load `guideQuizzes`;
- expose `quizzes` in initial data;
- resolve subscription entitlement outside the sandbox;
- expose `entitlements` to the shell;
- add a protected `GuidesAPI.openPaywall()` bridge;
- preserve the GuidesAPI behavior while moving completion to serialized appData mutations.

`control/content/release-manager.js` previews and `AI_RELEASES.md` were updated for `entitlements` and `openPaywall()`.

## Visual parity safeguard

The quiz metadata/content blocks and `drawJourneyTrail` function in the working file were verified to be identical to `guias-interativo-new-original.html`:

```text
27 quizzes
199 regular questions
27 bonus questions
identical drawJourneyTrail implementation
```

Runtime hydration had been capable of replacing complete embedded quiz content with incomplete/older datastore records. To preserve the user's original design and quiz behavior, `hydrateContractContent()` currently returns immediately. The embedded original HTML is therefore the rendering source of truth, while datastore records remain available to the runtime/migration.

The contract startup also redraws the SVG road after iframe layout using `requestAnimationFrame`, delayed retries, and `ResizeObserver`. This is intended to handle the sandboxed iframe being measured before its dimensions settle.

Do not remove or rewrite original CSS, journey rendering, quiz metadata, or `QUIZ_CONTENT` unless the user explicitly asks.

## Current publishing blocker

The uploaded file previews correctly in the Content panel:

- curved SVG road;
- `3 of 59` items;
- `O que é BLW?` first;
- quizzes visible.

The published widget still shows the legacy version:

- straight dashed road;
- `3 of 43` items;
- `Quando começar?` first;
- only the old quiz set.

The user ran a datastore diagnostic and got:

```json
{
  "stateError": null,
  "shellError": null,
  "shellCount": 3,
  "activeShellFound": false
}
```

`activeId` was absent from the serialized result, strongly indicating that `guideReleaseState.activeReleaseId` was never saved.

### Why publish is not completing

The deployed control panel is still using an older `release-manager.js` that calls native `window.confirm()`. BuildFire sandboxes the control iframe without `allow-modals`, producing:

```text
Ignored call to 'confirm()'. The document is sandboxed, and the 'allow-modals' keyword is not set.
```

The native confirmation returns/behaves as rejected, so publishing exits before inserting/activating the new release.

The local `control/content/release-manager.js` has already been changed to an in-page two-click confirmation:

1. Click **Publish release**.
2. Button changes to **Click again to publish**.
3. Click again within 8 seconds.

Release restoration was updated similarly.

However, uploading `guias-interativo-new.html` only changes datastore content. It does **not** deploy modified plugin files such as `release-manager.js` or `release-runtime.js`. Those files must be deployed/reloaded as part of the complete plugin package.

### One-time workaround for the old deployed control panel

In the Content iframe console, run this before clicking the old **Publish release** button:

```js
const originalConfirm = window.confirm;

window.confirm = () => {
  window.confirm = originalConfirm;
  return true;
};
```

This approves only the next confirmation and restores the original function immediately. Then click **Publish release** once and inspect the release status/console for the real datastore result.

If publishing then fails, capture the exact console error. A possible next issue is datastore record size, because the shell revision stores roughly 2.97 MB of HTML; do not assume this without the actual error.

## Datastore diagnostic

Run in the Content iframe console:

```js
buildfire.datastore.get("guideReleaseState", (stateError, stateResult) => {
  const state = stateResult?.data || stateResult || {};
  const activeId = state.activeReleaseId;

  buildfire.datastore.search(
    { page: 0, pageSize: 50 },
    "guideShellRevisions",
    (shellError, shellResult) => {
      const records = Array.isArray(shellResult)
        ? shellResult
        : shellResult?.result || [];

      const shells = records.map(record => record.data || record);
      const activeShell = shells.find(shell => shell.releaseId === activeId);

      console.log({
        stateError,
        shellError,
        activeId,
        shellCount: shells.length,
        activeShellFound: Boolean(activeShell),
        fileName: activeShell?.fileName,
        contractVersion: activeShell?.contractVersion,
        hasJourneySVG: activeShell?.html?.includes("function drawJourneyTrail"),
        hasQuizQuestions: activeShell?.html?.includes("const QUIZ_CONTENT")
      });
    }
  );
});
```

Expected after successful publication:

```text
activeShellFound: true
fileName: guias-interativo-new.html
contractVersion: 1
hasJourneySVG: true
hasQuizQuestions: true
```

If these are all true but the widget still displays `3 of 43`, the updated `widget/release-runtime.js` is not deployed or the widget is cached. Deploy the complete plugin code and hard-refresh/reopen the widget.

## Recommended next steps

1. Confirm whether the updated control and widget files have actually been deployed, not merely edited locally.
2. If not deployed, deploy the complete plugin package containing at least:
   - `control/content/release-manager.js`
   - `widget/release-runtime.js`
   - `control/content/migrate-existing-content.js`
   - `AI_RELEASES.md` (documentation only)
3. Reload the Content panel and re-stage `guias-interativo-new.html`.
4. Publish using the two-click in-page confirmation.
5. Rerun the datastore diagnostic and verify the active shell exists.
6. Hard-refresh/reopen the widget and verify `3 of 59`, curved SVG path, and playable questions.
7. Test progress persistence, birthdate, quiz completion/scores, premium guide access, back navigation, external link navigation, and paywall navigation on a real device.
8. Run `importNewQuizData({ dryRun: true })`, inspect the plan, then run `importNewQuizData()` if correct.

## Validation already performed

- JavaScript syntax checks passed for:
  - `guias-interativo-new.html` main executable script
  - `widget/release-runtime.js`
  - `control/content/release-manager.js`
  - `control/content/migrate-existing-content.js`
- Quiz extraction/migration dry run passed.
- Contract marker and forbidden-persistence checks passed.
- Original and working quiz content counts match.
- Original and working `drawJourneyTrail` function match.

No live publication or live datastore migration was completed by the agent.
