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
    for (const key of Object.keys(translations.defaults)) assert.ok(html.includes("guideLabel('" + key + "'") || html.includes('guideLabel("' + key + '"'), key);
    assert.ok(html.includes('${_escapeHtml(misses.length === 1 ? guideLabel'));
    assert.equal(translations.defaults.quizBonusSuccess[0], ' ');
    // All seven fixed streaks keep the original emoji and punctuation.
    for (let n = 2; n <= 8; n++) assert.ok(shell.includes("'" + translations.defaults['quizStreak' + n] + "'"));
});
