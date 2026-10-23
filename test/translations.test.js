const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const translations = require('../shared/guides-translations');
const shell = fs.readFileSync(require('node:path').join(__dirname, '../guias-interativo.html'), 'utf8');
function labels(html) {
    return JSON.parse(html.match(/<script id="guides-ui-labels"[^>]*>([\s\S]*?)<\/script>/)[1]);
}
test('translations preserve existing labels and safely overlay saved quiz text', () => {
    const original = labels(shell);
    const html = translations.apply(shell, { quizContinue: '</script><b>Next</b>' });
    assert.deepEqual(labels(translations.apply(shell, null)), original);
    assert.equal(labels(html).quizContinue, '</script><b>Next</b>');
    assert.equal(labels(html).inThisGuide, original.inThisGuide);
    assert.ok(!html.includes('</script><b>Next</b>'));
    assert.equal(translations.apply(html, { quizContinue: '</script><b>Next</b>' }), html);
    for (const match of html.matchAll(/^\s*<script\b([^>]*)>([\s\S]*?)<\/script>/gm)) {
        if (!match[1].includes('application/json') && match[2].trim()) new vm.Script(match[2]);
    }
});
test('legacy quiz messages use labels while retaining their exact defaults', () => {
    const html = translations.apply(shell, {});
    for (const key of Object.keys(translations.defaults).filter(key => !['searchPlaceholder', 'changeAgeTooltip'].includes(key) && !key.startsWith('fallback'))) assert.ok(html.includes("guideLabel('" + key + "'") || html.includes('guideLabel("' + key + '"') || html.includes('data-guides-label="' + key + '"'), key);
    assert.ok(html.includes('${_escapeHtml(misses.length === 1 ? guideLabel'));
    assert.equal(translations.defaults.quizBonusSuccess[0], ' ');
    // All seven fixed streaks keep the original emoji and punctuation.
    for (let n = 2; n <= 8; n++) assert.ok(shell.includes("'" + translations.defaults['quizStreak' + n] + "'"));
});

test('phase labels, rotating banners, search prompts, and progress labels use translations', () => {
    const overrides = Object.fromEntries(Object.keys(translations.defaults).map(key => [key, 'translated-' + key]));
    overrides.phaseYearsMonths = '{years} years {months} months';
    overrides.phase24 = 'Exploring: {age}';
    const html = translations.apply(shell, overrides);
    const start = html.indexOf('    function getPhaseFromAge(');
    const end = html.indexOf('\n    function ', start + 1);
    const context = { guideLabel: key => overrides[key] };
    vm.createContext(context);
    vm.runInContext(html.slice(start, end), context);
    assert.equal(context.getPhaseFromAge(5).label, 'translated-phase5');
    assert.equal(context.getPhaseFromAge(7).label, 'translated-phase7');
    assert.equal(context.getPhaseFromAge(26).label, 'Exploring: 2 years 2 months');
    assert.ok(html.includes('title="translated-changeAgeTooltip"'));
    const banners = html.slice(html.indexOf('const fearMessages ='), html.indexOf('let fearIdx ='));
    assert.equal((banners.match(/guideLabel\(/g) || []).length, 8);
    assert.ok(html.includes("${_escapeHtml(guideLabel('searchAnswer'"));
    assert.ok(html.includes("${_escapeHtml(guideLabel('readCount'"));
    assert.equal(translations.apply(html, overrides), html);
});

test('translation tabs preserve edits across screens and reveal invalid placeholders before save', () => {
    const nodes = {};
    let focused, saved;
    class Element {
        constructor() { this.children = []; this.attributes = {}; this.handlers = {}; this.value = ''; }
        set id(value) { this._id = value; nodes[value] = this; }
        get id() { return this._id; }
        append(...children) { this.children.push(...children); }
        setAttribute(key, value) { this.attributes[key] = value; }
        addEventListener(key, callback) { this.handlers[key] = callback; }
        focus() { focused = this.id; }
    }
    const document = { createElement: () => new Element(), getElementById: id => nodes[id] ||= new Element() };
    const context = { document, window: { GuidesTranslations: translations }, buildfire: { datastore: {
        get: (tag, callback) => callback(null, { data: { customExisting: 'keep', guideStart: 'Begin' } }),
        save: (data, tag, callback) => { saved = data; callback(null); }
    } } };
    vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname, '../control/content/translations.js'), 'utf8'), context);
    const fieldCount = Object.keys(nodes).filter(key => key.startsWith('translation-') && !key.startsWith('translation-tab-') && !key.startsWith('translation-panel-')).length;
    assert.equal(fieldCount, Object.keys(translations.defaults).length);
    nodes['translation-searchAnswer'].value = 'Helpful answer';
    nodes['translation-tab-search'].handlers.click();
    assert.equal(nodes['translation-panel-search'].hidden, false);
    nodes['translation-tab-search'].handlers.keydown({ key: 'ArrowRight', preventDefault() {} });
    assert.equal(focused, 'translation-tab-reader');
    nodes['translation-quizBeatRecord'].value = 'Beat my score';
    const submit = () => nodes['translations-form'].handlers.submit({ preventDefault() {} });
    submit();
    assert.equal(saved, undefined);
    assert.equal(nodes['translation-panel-quizIntro'].hidden, false);
    assert.equal(focused, 'translation-quizBeatRecord');
    nodes['translation-quizBeatRecord'].value = 'Beat {hits}/{total}';
    submit();
    assert.equal(saved.searchAnswer, 'Helpful answer');
    assert.equal(saved.guideStart, 'Begin');
    assert.equal(saved.customExisting, 'keep');
    assert.equal(saved.quizBeatRecord, 'Beat {hits}/{total}');
});

test('fallback renderer translates labels safely and never displays Read badges', () => {
    const source = fs.readFileSync(require('node:path').join(__dirname, '../widget/release-runtime.js'), 'utf8');
    const context = { GuidesTranslations: translations, buildfire: {}, console };
    context.window = context;
    vm.runInNewContext(source.replace('global.GuidesReleaseRuntime = {', 'global.renderForTest = renderBuiltIn; global.GuidesReleaseRuntime = {'), context);
    const app = { querySelectorAll: () => [] };
    const state = { lessons: [{ slug: 'read', title: 'Read guide' }, { slug: 'next', title: 'Next guide' }], completed: new Set(['read']),
        translations: { guideStart: '<Start>', fallbackYourJourney: 'Your translated journey', fallbackEmptyTitle: 'Empty' } };
    context.renderForTest(app, state);
    assert.ok(app.innerHTML.includes('Your translated journey'));
    assert.ok(app.innerHTML.includes('&lt;Start&gt;'));
    assert.ok(!app.innerHTML.includes('class="badge">Read'));
    state.lessons = [];
    context.renderForTest(app, state);
    assert.ok(app.innerHTML.includes('<h1>Empty</h1>'));
});

test('static translations refresh safely without changing canonical content or nesting markers', () => {
    const first = translations.apply(shell, { quizBack: 'Back to journey', searchPlaceholder: 'Find guides' });
    const second = translations.apply(first, { quizBack: '<img src=x onerror=alert(1)>', searchPlaceholder: 'Search "guides"' });
    assert.ok(second.includes('&lt;img src=x onerror=alert(1)&gt;'));
    assert.ok(second.includes('placeholder="Search &quot;guides&quot;"'));
    assert.equal(translations.apply(second, { quizBack: '<img src=x onerror=alert(1)>', searchPlaceholder: 'Search "guides"' }), second);
    const content = value => value.match(/<script id="guides-content"[^>]*>([\s\S]*?)<\/script>/)[1];
    assert.equal(content(second), content(shell));
    assert.equal(Object.hasOwn(translations.defaults, 'guideRead'), false);
});

test('standalone quiz and guide nodes use the same Start label before runtime translation', () => {
    const context = {
        completedQuizzes: new Set(), readGuides: new Set(),
        guideLabel: (key, fallback) => labels(shell)[key] ?? fallback,
        _escapeHtml: value => value, iconHTML: () => ''
    };
    vm.createContext(context);
    for (const name of ['buildJourneyQuizNode', 'guideStatusTag']) {
        const start = shell.indexOf('    function ' + name + '(');
        const end = shell.indexOf('\n    function ', start + 1);
        vm.runInContext(shell.slice(start, end), context);
    }
    assert.ok(context.buildJourneyQuizNode({ id: 'quiz' }, true).includes('>Start</div>'));
    assert.equal(context.guideStatusTag({ id: 'guide' }, true, 'journey-node-label'), '<span class="journey-node-label">Start</span>');
});

test('quiz nodes share the guide Start translation and replay messages interpolate translated scores safely', () => {
    const overrides = { guideStart: 'Commencer', quizBeatRecord: 'Beat {hits}/{total}', quizBestResult: '<b>{hits}/{total}</b>', quizAttempt: ' (attempt {count})' };
    const html = translations.apply(shell, overrides);
    const nodes = {};
    const context = {
        document: { getElementById: id => nodes[id] ||= { style: {} } },
        quizScores: { sample: { hits: 2, total: 5, plays: 3 } },
        completedQuizzes: new Set(), iconHTML: () => '',
        guideLabel: (key, fallback) => overrides[key] ?? fallback,
        _escapeHtml: value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    };
    vm.createContext(context);
    for (const name of ['buildJourneyQuizNode', 'renderQuizIntro']) {
        const start = html.indexOf('    function ' + name + '(');
        const end = html.indexOf('\n    function ', start + 1);
        vm.runInContext(html.slice(start, end), context);
    }
    assert.ok(context.buildJourneyQuizNode({ id: 'sample' }, true).includes('Commencer'));
    assert.ok(!context.buildJourneyQuizNode({ id: 'sample' }, true).includes('Começar'));
    context.renderQuizIntro({ id: 'sample' }, { intro: { title: '', sub: '' }, questions: [1, 2, 3, 4, 5] });
    assert.equal(nodes['btn-quiz-start'].textContent, 'Beat 2/5');
    assert.equal(nodes['quiz-done-stats'].innerHTML, '<b>&lt;b&gt;2/5&lt;/b&gt;</b> (attempt 3)');
});
