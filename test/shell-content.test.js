"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const html = fs.readFileSync(path.join(__dirname, "../guias-interativo.html"), "utf8");

function shellFunction(name) {
    const start = html.indexOf("    function " + name + "(");
    assert.ok(start >= 0, name);
    const end = html.indexOf("\n    }", start) + "\n    }".length;
    return html.slice(start, end);
}

test("guide status follows the first unread guide, skipping quizzes and advancing on completion", () => {
    const readGuides = new Set(['first']);
    const order = [{ id: 'first', kind: 'guide' }, { id: 'quiz', kind: 'quiz' },
        { id: 'second', kind: 'guide' }, { id: 'third', kind: 'guide' }];
    const helpers = new Function('readGuides', 'curriculumOrder', 'guideLabel', '_escapeHtml',
        shellFunction('nextUnreadGuideId') + '\n' + shellFunction('guideStatusTag') +
        '\nreturn { nextUnreadGuideId, guideStatusTag };')(readGuides, () => order, (_, fallback) => fallback, value => value);
    assert.equal(helpers.nextUnreadGuideId(), 'second');
    assert.match(helpers.guideStatusTag({ id: 'second' }, true, 'badge'), />Start</);
    assert.equal(helpers.guideStatusTag({ id: 'first' }, true, 'badge'), '');
    assert.equal(helpers.guideStatusTag({ id: 'third' }, false, 'badge'), '');
    readGuides.add('second');
    assert.equal(helpers.nextUnreadGuideId(), 'third');
    readGuides.add('third');
    assert.equal(helpers.nextUnreadGuideId(), null);
    readGuides.delete('first');
    assert.equal(helpers.nextUnreadGuideId(), 'first');
});

test("state icons use independent images and exact backgrounds with legacy fallback", () => {
    const readGuides = new Set();
    const guide = { id: 'first', icon: 'book', iconUnread: 'https://images.test/unread.png',
        iconStart: 'https://images.test/start.png', iconRead: 'https://images.test/read.png' };
    let nextId = 'other';
    const helpers = new Function('readGuides', 'nextUnreadGuideId', `
        const GUIDE_ICON_MAP = {}, ICON_COLORS = {};
        ${['guideVisualState', 'guideIconId', 'guideIconBadgeHTML', 'iconHTML', 'iconColor'].map(name => name === 'iconColor' ? "function iconColor() { return '#575857'; }" : shellFunction(name)).join('\n')}
        return { icon: guideIconId, badge: guideIconBadgeHTML };
    `)(readGuides, () => nextId);
    assert.equal(helpers.icon(guide), guide.iconUnread);
    assert.match(helpers.badge(guide, 26, 40), /background:#FFFFFF/);
    nextId = 'first';
    assert.equal(helpers.icon(guide), guide.iconStart);
    assert.match(helpers.badge(guide, 26, 40), /background:#F9A247/);
    readGuides.add('first');
    assert.equal(helpers.icon(guide), guide.iconRead);
    assert.match(helpers.badge(guide, 26, 40), /background:#1ABC9B/);
    guide.iconRead = '';
    assert.equal(helpers.icon(guide), 'book');
    guide.iconRead = 'javascript:alert(1)';
    assert.equal(helpers.icon(guide), 'book');
    guide.iconRead = 'https://images.test/a" onerror="alert(1)';
    assert.match(helpers.badge(guide, 26, 40), /a&amp;quot;|a&quot;/);
    assert.doesNotMatch(helpers.badge(guide, 26, 40), /src="[^"]*" onerror=/);
});

test("canonical hydration preserves each uploaded state icon", () => {
    const app = renderer();
    const data = snapshot();
    Object.assign(data.lessons[0], { iconUnread: 'https://images.test/u.png', iconStart: 'https://images.test/s.png', iconRead: 'https://images.test/r.png' });
    app.hydrate(data);
    const guide = app.guides.find(item => item.id === 'new-guide');
    for (const key of ['iconUnread', 'iconStart', 'iconRead']) assert.equal(guide[key], data.lessons[0][key]);
});

function renderer() {
    const headers = { titles: [{ textContent: 'Static title' }, { textContent: 'Static title' }],
        descriptions: [{ textContent: 'Static description' }] };
    const functions = ["guideLabel", "hydrateContractContent", "collectAllLibraryGuides",
        "buildPhaseSections", "buildThemeSections", "curriculumOrder", "isItemDone",
        "_getFullIndex", "_buildIndex", "_norm", "_stripHtml", "_tokenize"];
    return new Function("document", "headers", `
        const ALL_GUIDES_FLAT = [{ id: 'legacy', title: 'Legacy' }];
        const FUNDAMENTALS = ALL_GUIDES_FLAT.slice(), AGELESS_GUIDES = [];
        const GUIDES_DATA = { 5: ALL_GUIDES_FLAT.slice() }, LIST_THEMES = [];
        const QUIZZES = [{ id: 'legacy-quiz' }], QUIZ_BY_ID = { 'legacy-quiz': {} };
        const QUIZ_BY_GUIDE_ID = { legacy: QUIZZES }, QUIZ_CONTENT = { 'legacy-quiz': {} };
        const ALL_ITEMS_FLAT = [], MONTHLY_SUMMARY = { 5: { title: 'Legacy milestone' } };
        const moduleState = {}, readGuides = new Set(['legacy']), completedQuizzes = new Set(['legacy-quiz']);
        let contractJourneySections = null, _themeKeyByGuideId = {}, _searchIndex = [], _fullSearchIndex = [];
        let currentGuides = [], allCurrentGuides = [], phaseHighlightGuides = [], currentPhase = { key: '6' };
        const PHASE_LABELS = {};
        ${functions.map(shellFunction).join("\n")}
        return { headers, hydrate: hydrateContractContent, phases: buildPhaseSections, themes: buildThemeSections,
            guides: ALL_GUIDES_FLAT, quizzes: QUIZZES, quizContent: QUIZ_CONTENT, quizLinks: QUIZ_BY_GUIDE_ID,
            items: ALL_ITEMS_FLAT, ages: GUIDES_DATA, milestones: MONTHLY_SUMMARY,
            search: _getFullIndex, completed: () => ALL_ITEMS_FLAT.filter(isItemDone), label: guideLabel };
    `)({
        querySelectorAll: selector => selector.includes('title') ? headers.titles : headers.descriptions,
        getElementById: () => ({ textContent: JSON.stringify({ inThisGuide: "Dans ce guide" }) }),
        createElement: () => ({ innerHTML: "", querySelectorAll() {
            return Array.from(this.innerHTML.matchAll(/<li>(.*?)<\/li>/g)).map(m => ({ innerHTML: m[1] }));
        } })
    }, headers);
}

test("saved organization titles and descriptions replace shell copy and clear when removed", () => {
    const app = renderer();
    const data = snapshot();
    const journey = data.journeyData.journeys[0];
    journey.title = 'Saved country title';
    journey.description = 'Saved description';
    app.hydrate(data);
    assert.deepEqual(app.headers.titles.map(node => node.textContent), [journey.title, journey.title]);
    assert.equal(app.headers.descriptions[0].textContent, journey.description);
    journey.title = 'Edited in the control panel';
    journey.description = '';
    journey.sections[0].title = 'Edited section';
    journey.listThemes[0].label = 'Edited category';
    app.hydrate(data);
    assert.ok(app.headers.titles.every(node => node.textContent === journey.title && !node.hidden));
    assert.equal(app.headers.descriptions[0].textContent, '');
    assert.equal(app.headers.descriptions[0].hidden, true);
    assert.equal(app.phases()[0].label, 'Edited section');
    assert.equal(app.themes()[0].label, 'Edited category');
});

function snapshot() {
    return {
        lessons: [
            { slug: "new-guide", title: "New guide", bodyHtml: "<p>Unique search phrase</p>", published: true },
            { slug: "second-guide", title: "Second guide", bodyHtml: "", published: true },
            { slug: "archived", title: "Archived", published: true },
            { slug: "draft", title: "Draft", published: false }
        ],
        archivedLessonIds: ["archived"], archivedQuizIds: ["archived-quiz"],
        quizzes: [
            { id: "shared-quiz", afterGuideId: "new-guide", alsoAfterGuideIds: ["second-guide", "archived"], questions: [{ text: "Question" }] },
            { id: "archived-quiz", afterGuideId: "new-guide", questions: [{}] },
            { id: "draft-quiz", afterGuideId: "new-guide", published: false },
            { id: "orphan-quiz", afterGuideId: "archived", questions: [{}] }
        ],
        journeyData: { defaultJourneyId: "fr", journeys: [{ id: "fr", published: true,
            sections: [
                { id: "fundamentals", title: "Basics", lessonIds: ["second-guide", "second-guide"] },
                { id: "6", title: "Six months", lessonIds: ["new-guide", "second-guide", "archived", "draft"] },
                { id: "7", title: "Empty", lessonIds: [] }
            ],
            listThemes: [
                { key: "new-theme", label: "New theme", lessonIds: ["new-guide", "second-guide"] },
                { key: "empty", label: "Empty", lessonIds: ["archived"] }
            ],
            phaseHighlights: { 5: [], 6: ["new-guide"], 7: ["new-guide"] },
            milestones: { 6: { title: "Six months", expectHtml: "<ul><li>New milestone</li></ul>", rememberHtml: "" } }
        }] }
    };
}

test("canonical catalog adds unknown slugs, removes archived content, and honors independent organization axes", () => {
    const app = renderer();
    app.hydrate(snapshot());
    assert.deepEqual(app.guides.map(g => g.id), ["second-guide", "new-guide"]);
    assert.deepEqual(app.phases().map(s => [s.key, s.guides.map(g => g.id)]), [
        ["fundamentals", ["second-guide"]], ["6", ["new-guide"]]
    ]);
    assert.deepEqual(app.themes().map(s => [s.key, s.guides.map(g => g.id)]), [
        ["new-theme", ["new-guide", "second-guide"]]
    ]);
    assert.deepEqual(app.ages[7].map(g => g.id), ["new-guide"]);
    assert.equal(app.guides[0].content, "");
    assert.deepEqual(app.quizzes.map(q => q.id), ["shared-quiz"]);
    assert.deepEqual(Object.keys(app.quizLinks).sort(), ["new-guide", "second-guide"]);
    assert.equal(app.items.length, 3, "shared quiz counts only once");
    assert.equal(app.completed().length, 0, "archived completion does not inflate totals");
    assert.equal(app.search().find(item => item.guide.id === "new-guide").full.includes("unique search phrase"), true);
    assert.deepEqual(Object.keys(app.milestones), ["6"]);
    assert.deepEqual(app.milestones[6].esperar, ["New milestone"]);
    assert.equal(app.label("inThisGuide", "Neste guia"), "Dans ce guide");
});

test("saved category moves and order replace stale guide metadata without moving journey sections", () => {
    const app = renderer();
    const data = snapshot();
    data.lessons[0].listThemeKey = 'new-theme';
    const journey = data.journeyData.journeys[0];
    app.hydrate(data);
    journey.listThemes[0].lessonIds = ['second-guide'];
    journey.listThemes[1].lessonIds = ['new-guide'];
    journey.listThemes[1].label = 'Destination category';
    journey.listThemes.reverse();
    app.hydrate(data);
    assert.deepEqual(app.themes().map(s => [s.label, s.guides.map(g => g.id)]), [
        ['Destination category', ['new-guide']], ['New theme', ['second-guide']]
    ]);
    assert.deepEqual(app.phases().map(s => [s.key, s.guides.map(g => g.id)]), [
        ['fundamentals', ['second-guide']], ['6', ['new-guide']]
    ]);
    journey.sections[0].lessonIds = ['new-guide', 'second-guide'];
    journey.sections[1].lessonIds = [];
    app.hydrate(data);
    assert.deepEqual(app.phases().map(s => [s.key, s.guides.map(g => g.id)]), [
        ['fundamentals', ['new-guide', 'second-guide']]
    ]);
});

test("manual additions appear and rehydration clears stale search, quizzes, and empty catalogs", () => {
    const app = renderer();
    const data = snapshot();
    app.hydrate(data);
    app.search();
    data.lessons.push({ slug: "manual", title: "Manually added", bodyHtml: "<p>New material</p>" });
    data.quizzes = [];
    app.hydrate(data);
    assert.equal(app.search().some(item => item.guide.id === "manual"), true);
    assert.equal(app.phases().at(-1).guides[0].id, "manual", "unplaced guides remain accessible");
    assert.equal(app.themes().at(-1).guides[0].id, "manual");
    assert.deepEqual(app.quizzes, []);
    assert.deepEqual(app.quizContent, {});
    app.hydrate({ lessons: [], quizzes: [], journeyData: { journeys: [] } });
    assert.deepEqual(app.guides, []);
    assert.deepEqual(app.phases(), []);
    assert.deepEqual(app.themes(), []);
    assert.deepEqual(app.items, []);
    assert.deepEqual(app.search(), []);
});

test("both standalone preview bootstraps filter archives and unpublished records", async () => {
    const manager = fs.readFileSync(path.join(__dirname, "../control/content/release-manager.js"), "utf8");
    const sources = [
        html.match(/<script id="guides-working-preview-bootstrap">([\s\S]*?)<\/script>/)[1],
        manager.match(/const previewBootstrap = `<script id="guides-working-preview-bootstrap">([\s\S]*?)<\\\/script>`;/)[1]
    ];
    for (const source of sources) {
        const data = snapshot();
        data.journeyData.journeys.unshift({ id: "hidden", published: false });
        const context = { window: {}, document: { getElementById: () => ({ textContent: JSON.stringify(data) }) } };
        vm.runInNewContext(source, context);
        const result = await context.window.GuidesAPI.getInitialData();
        assert.deepEqual(Array.from(result.lessons, g => g.slug), ["new-guide", "second-guide"]);
        assert.equal(result.quizzes.some(q => q.id === "archived-quiz" || q.id === "draft-quiz"), false);
        assert.equal(result.activeJourney.id, "fr");
    }
});

test("image actions, anchor links, and external links work without accumulating click handlers", () => {
    const actions = [], urls = [], anchors = [], listeners = [];
    const api = { openActionItem: action => { actions.push(action); return Promise.resolve(); },
        openUrl: url => { urls.push(url); return Promise.resolve(); } };
    const prepare = new Function("GuidesAPI", "window", "document", "scrollToGuideSection", "debugLogError",
        shellFunction("parseBuildFireActionItem") + shellFunction("prepareWysiwygGuideContent") + "; return prepareWysiwygGuideContent;")(
        api, { unescape }, { getElementById: () => ({}) }, id => anchors.push(id), () => {});
    const content = { dataset: {}, querySelectorAll: () => [], contains: () => true,
        addEventListener: (name, fn) => listeners.push(fn) };
    prepare(content);
    prepare(content);
    assert.equal(listeners.length, 1);
    function click(attributes) {
        const element = { getAttribute: name => attributes[name] || null };
        listeners[0]({ target: { closest: selector => {
            assert.match(selector, /\[data-execute\]/);
            return element;
        } }, preventDefault() {}, stopImmediatePropagation() {} });
    }
    const action = { action: "linkToApp", instanceId: "fr-guide" };
    click({ "data-execute": encodeURIComponent(JSON.stringify(action)) });
    click({ "data-action-item": encodeURIComponent(JSON.stringify(action)) });
    click({ href: "#section-two" });
    click({ href: "https://example.org" });
    assert.deepEqual(actions, [action, action]);
    assert.deepEqual(anchors, ["section-two"]);
    assert.deepEqual(urls, ["https://example.org"]);
});

test("section deep links preserve anchors through reader scroll restoration", () => {
    const calls = [];
    const handle = new Function("ALL_GUIDES_FLAT", "QUIZ_BY_ID", "openGuide", "openQuizPlay",
        shellFunction("handleDeepLink") + "; return handleDeepLink;")(
        [{ id: "new-guide" }], {}, (...args) => calls.push(args), () => {});
    handle({ type: "guide", guideId: "new-guide", anchor: "section-two" });
    assert.deepEqual(calls, [["new-guide", "deeplink", "section-two"]]);
    const restored = [];
    const restore = new Function("readerScrollPositions", "requestAnimationFrame", "document", "scrollToGuideSection",
        "scrollContainerTo", "getScrollMetrics", "showResumeToast", "updateReaderProgressBar",
        "autoCompleteArmed", "readerPositionSaveArmed",
        shellFunction("scrollReaderToSavedPosition") + "; return scrollReaderToSavedPosition;")(
        { "new-guide": 0.8 }, fn => fn(), { getElementById: id => id === "section-two" ? {} : null },
        id => restored.push(id), () => assert.fail("anchor should override saved position"), () => ({}), () => {}, () => {}, false, false);
    restore("new-guide", "section-two");
    assert.deepEqual(restored, ["section-two"]);
});


test("completion section honors visibility and translated text in both views", () => {
    const start = html.indexOf("      const finish = hydrateContractContent.finishCard");
    const end = html.indexOf("      // A estradinha", start);
    const render = new Function("hydrateContractContent", "mode", "document", "pathEl", "guideLabel", "openGarfinhoApp", "GuidesAPI", html.slice(start, end));
    const executed = [];
    let legacyClicks = 0;
    function card(settings, mode = "journey") {
        const root = { children: [], appendChild(node) { this.children.push(node); } };
        render({ finishCard: settings }, mode, { createElement: () => ({ append(...nodes) { this.children = nodes; } }) }, root,
            key => "translated:" + key, () => { legacyClicks++; },
            { openActionItem: action => { executed.push(action); return Promise.resolve(); } });
        return root.children;
    }
    assert.equal(card({ enabled: false }).length, 0);
    assert.equal(card({ enabled: false }, "list").length, 0);
    assert.equal(card({})[0].children[0].textContent, "translated:finishTitle");
    assert.equal(card({}, "list")[0].children[0].textContent, "translated:finishListTitle");
    const custom = card({ title: "Custom title", text: "<b>Plain text</b>", buttonLabel: "Continue" })[0];
    assert.deepEqual(custom.children.map(node => node.textContent), ["Custom title", "<b>Plain text</b>", "Continue"]);
    const action = { action: "linkToApp", instanceId: "selected-plugin" };
    card({ actionItem: action })[0].children[2].onclick();
    assert.deepEqual(executed, [action]);
    assert.equal(legacyClicks, 0);
    card({})[0].children[2].onclick();
    assert.equal(legacyClicks, 1);
    const app = renderer();
    const data = snapshot();
    data.journeyData.journeys[0].finishCard = { enabled: false, title: "Saved" };
    app.hydrate(data);
    assert.deepEqual(app.hydrate.finishCard, { enabled: false, title: "Saved" });
    delete data.journeyData.journeys[0].finishCard;
    app.hydrate(data);
    assert.deepEqual(app.hydrate.finishCard, {});
});
