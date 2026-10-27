const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const policy = require('../shared/guides-content-import');
const copy = value => JSON.parse(JSON.stringify(value));
const options = { updateGuides: true, updateQuizzes: true };
function snapshot() {
    return {
        lessons: [{ slug: 'first', title: 'First', bodyHtml: '<p>Original</p>', tldr: [], readTime: '2 min', published: true, premium: true, iconUnread: 'https://images.test/a.png', listThemeKey: 'topic' },
            { slug: 'second', title: 'Second', bodyHtml: '<p>Second</p>', published: true }],
        quizzes: [{ id: 'q1', title: 'Quiz', questions: [{ text: 'Question', options: ['A', 'B'], correct: 0 }], questionCount: 1, intro: { title: 'Hello' }, results: [{ title: 'Done' }], afterGuideId: 'first', published: true }],
        journeyData: { journeys: [] }
    };
}
test('content import preserves current icons, premium, publication, relationships and organization', async () => {
    const original = snapshot(), base = await policy.baseline(original), incoming = copy(original), live = copy(original);
    incoming.lessons[0].title = 'Edited'; incoming.lessons[0].premium = false; incoming.lessons[0].published = false;
    incoming.lessons[0].iconUnread = 'https://bad.test/icon'; incoming.lessons[0].listThemeKey = 'changed';
    incoming.quizzes[0].title = 'Edited quiz'; incoming.quizzes[0].afterGuideId = 'second';
    incoming.journeyData = { journeys: [{ id: 'replaced' }] }; incoming.archivedLessonIds = ['second'];
    live.lessons[0].iconUnread = 'https://images.test/new.png'; live.lessons[0].listThemeKey = 'new-topic';
    const plan = await policy.plan(incoming, live, base, options);
    assert.equal(plan.lessons.length, 1); assert.equal(plan.lessons[0].title, 'Edited');
    assert.equal(plan.lessons[0].iconUnread, live.lessons[0].iconUnread);
    assert.equal(plan.lessons[0].listThemeKey, 'new-topic'); assert.equal(plan.lessons[0].premium, true); assert.equal(plan.lessons[0].published, true);
    assert.equal(plan.quizzes[0].afterGuideId, 'first'); assert.equal(plan.journeyData, null); assert.deepEqual(plan.archivedLessonIds, []);
});
test('unchanged stale records are skipped, conflicting edits are blocked and matching edits are idempotent', async () => {
    const original = snapshot(), base = await policy.baseline(original), incoming = copy(original), live = copy(original);
    live.lessons[1].bodyHtml = '<p>CMS edit</p>'; incoming.lessons[0].title = 'AI edit';
    assert.equal((await policy.plan(incoming, live, base, options)).lessons.length, 1);
    live.lessons[0].title = 'Different CMS edit';
    await assert.rejects(policy.plan(incoming, live, base, options), /first/);
    live.lessons[0].title = 'AI edit';
    assert.equal((await policy.plan(incoming, live, base, options)).lessons.length, 0);
    await assert.rejects(policy.plan(incoming, live, null, options), /fresh working HTML/);
});
test('normalization during export does not create false stale conflicts', async () => {
    const original = snapshot(), normalized = copy(original);
    original.lessons[0].bodyHtml = '<img src=x>'; normalized.lessons[0].bodyHtml = '<img src="x">';
    const base = await policy.baseline(original, normalized);
    assert.equal((await policy.plan(normalized, original, base, options)).lessons.length, 0);
    normalized.lessons[0].title = 'Changed';
    assert.equal((await policy.plan(normalized, original, base, options)).lessons[0].title, 'Changed');
});
test('new records publish immediately and archived/deleted records cannot be resurrected by an old export', async () => {
    const original = snapshot(), base = await policy.baseline(original), incoming = copy(original), live = copy(original);
    incoming.lessons.push({ slug: 'new', title: 'New', bodyHtml: '<p>New</p>', published: true, premium: true, icon: 'changed' });
    incoming.quizzes.push({ ...incoming.quizzes[0], id: 'new-quiz', afterGuideId: 'second' });
    const plan = await policy.plan(incoming, live, base, options);
    assert.equal(plan.lessons[0].published, true); assert.equal(plan.lessons[0].premium, false);
    assert.equal(plan.quizzes[0].published, true); assert.equal(plan.quizzes[0].afterGuideId, 'second');
    incoming.lessons[0].title = 'Edited'; live.lessons[0].published = false;
    await assert.rejects(policy.plan(incoming, live, base, options), /first/);
    live.lessons.shift(); await assert.rejects(policy.plan(incoming, live, base, options), /first/);
    assert.equal((await policy.plan(incoming, live, base, { updateGuides: false, updateQuizzes: false })).lessons.length, 0);
});

// Execute the real publisher against a callback-based datastore, without browser startup.
function publisher(original, draft, hooks = {}) {
    const records = { guideLessons: original.lessons.map((data, i) => ({ id: 'g' + i, data: copy(data) })), guideQuizzes: original.quizzes.map((data, i) => ({ id: 'q' + i, data: copy(data) })) };
    const singleton = { guideJourneys: copy(original.journeyData) }, writes = [], nodes = {};
    function element() { return { dataset: {}, style: {}, classList: { add() {}, remove() {} }, append() {}, appendChild() {}, replaceChildren() {}, removeAttribute() {}, setAttribute() {}, textContent: '', innerHTML: '' }; }
    const context = { console: { error() {} }, setTimeout, clearTimeout, CustomEvent: class {}, dispatchEvent() {}, GuidesContentImport: policy,
        GuidesCatalogSync: { async syncFromDatastore() { if (hooks.sync) await hooks.sync(records); } }, GuidesDeepLinks: { async syncAll() {} },
        document: { getElementById: id => nodes[id] ||= element(), createElement: element }, buildfire: { datastore: {
            search(query, tag, callback) { callback(null, copy(records[tag] || [])); },
            get(tag, callback) { callback(null, { data: copy(singleton[tag] || null) }); },
            update(id, data, tag, callback) { const item = records[tag].find(record => record.id === id); item.data = copy(data); writes.push({ tag, data: copy(data) }); callback(null, { id, data }); if (hooks.write) hooks.write(records, writes); },
            insert(data, tag, unused, callback) { const id = 'new' + writes.length; (records[tag] ||= []).push({ id, data: copy(data) }); writes.push({ tag, data: copy(data) }); callback(null, { id, data }); },
            delete(id, tag, callback) { records[tag] = records[tag].filter(record => record.id !== id); callback(null); },
            save(data, tag, callback) { singleton[tag] = copy(data); writes.push({ tag, data: copy(data) }); callback(null); }
        } } };
    context.window = context;
    const source = fs.readFileSync(require('node:path').join(__dirname, '../control/content/release-manager.js'), 'utf8');
    vm.runInNewContext(source.replace('    initialize();', '    global.testAPI = { state, publishContentDraft, refreshDraftSelection, addWorkingBlocks };'), context);
    context.testAPI.state.draft = draft;
    return { context, records, singleton, writes, nodes };
}
async function draftFor(original, incoming) {
    return { contentOnly: true, options, baseline: await policy.baseline(original), validation: { content: incoming, warnings: [], contract: 1 }, before: original, fileName: 'working.html', html: '<html><head></head><body></body></html>' };
}
test('publisher updates only changed content, publishes multiple new items and never writes the shell or organization', async () => {
    const original = snapshot(), incoming = copy(original); incoming.lessons[0].title = 'Edited';
    incoming.lessons.push({ slug: 'new-a', title: 'A', bodyHtml: '<p>A</p>' }, { slug: 'new-b', title: 'B', bodyHtml: '<p>B</p>' });
    incoming.quizzes.push({ ...incoming.quizzes[0], id: 'new-q' });
    const harness = publisher(original, await draftFor(original, incoming));
    await harness.context.testAPI.publishContentDraft();
    assert.equal(harness.context.testAPI.state.draft, null);
    assert.equal(harness.writes.length, 4);
    assert.ok(harness.writes.every(write => ['guideLessons', 'guideQuizzes'].includes(write.tag)));
    assert.equal(harness.records.guideLessons.find(record => record.data.slug === 'new-b').data.published, true);
    assert.deepEqual(harness.singleton.guideJourneys, original.journeyData);
});
test('new quiz links can target a guide created in the same import and reject unpublished or missing targets', async () => {
    const original = snapshot(), incoming = copy(original), base = await policy.baseline(original);
    incoming.lessons.push({ slug: 'new-guide', title: 'New guide', bodyHtml: '<p>New</p>', published: false });
    incoming.quizzes.push({ ...incoming.quizzes[0], id: 'new-quiz', afterGuideId: 'new-guide', published: false });
    const planned = await policy.plan(incoming, original, base, options);
    assert.equal(planned.lessons[0].published, true);
    assert.equal(planned.quizzes[0].published, true);
    assert.equal(planned.quizzes[0].sourceGuideId, 'new-guide');
    const harness = publisher(original, await draftFor(original, incoming));
    await harness.context.testAPI.publishContentDraft();
    assert.equal(harness.context.testAPI.state.draft, null);
    assert.equal(harness.records.guideQuizzes.find(item => item.data.id === 'new-quiz').data.afterGuideId, 'new-guide');
    await assert.rejects(policy.plan(incoming, original, base, { updateGuides: false, updateQuizzes: true }), /missing or unpublished/);
    incoming.quizzes.at(-1).afterGuideId = '';
    await assert.rejects(policy.plan(incoming, original, base, options), /needs afterGuideId/);
    incoming.quizzes.at(-1).afterGuideId = 'first';
    original.lessons[0].published = false;
    await assert.rejects(policy.plan(incoming, original, base, options), /missing or unpublished/);
});

test('content edits keep existing unpublished records unpublished', async () => {
    const original = snapshot(); original.lessons[0].published = false; original.quizzes[0].published = false;
    const base = await policy.baseline(original), incoming = copy(original);
    incoming.lessons[0].title = 'Edited draft'; incoming.lessons[0].published = true;
    incoming.quizzes[0].title = 'Edited quiz'; incoming.quizzes[0].published = true;
    const planned = await policy.plan(incoming, original, base, options);
    assert.equal(planned.lessons[0].published, false);
    assert.equal(planned.quizzes[0].published, false);
});

test('publisher rechecks stale edits before writing and rolls back its own partial writes', async () => {
    const original = snapshot(), incoming = copy(original); incoming.lessons[0].title = 'Edited'; incoming.lessons[1].title = 'Second edit';
    const harness = publisher(original, await draftFor(original, incoming), { write(records, writes) { if (writes.length === 1) records.guideLessons[1].data.title = 'Concurrent CMS edit'; } });
    await harness.context.testAPI.publishContentDraft();
    assert.equal(harness.records.guideLessons[0].data.title, 'First');
    assert.equal(harness.records.guideLessons[1].data.title, 'Concurrent CMS edit');
    assert.match(harness.nodes['publish-status'].textContent, /restored/);
    const stale = publisher(original, await draftFor(original, incoming));
    stale.records.guideLessons[0].data.title = 'Newer edit';
    await stale.context.testAPI.publishContentDraft();
    assert.equal(stale.writes.length, 0); assert.match(stale.nodes['publish-status'].textContent, /No content was changed/);
});
test('rollback preserves edits made by another editor after an import write', async () => {
    const original = snapshot(), incoming = copy(original); incoming.lessons[0].title = 'Edited';
    const harness = publisher(original, await draftFor(original, incoming), { sync(records) { records.guideLessons[0].data.title = 'Another editor'; throw new Error('sync failed'); } });
    await harness.context.testAPI.publishContentDraft();
    assert.equal(harness.records.guideLessons[0].data.title, 'Another editor');
    assert.match(harness.nodes['publish-status'].textContent, /could not be restored/);
});
