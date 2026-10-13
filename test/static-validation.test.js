"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

test("edited runtime and control JavaScript parses", () => {
    [
        "shared/guides-home-contract.js",
        "shared/guides-catalog-sync.js",
        "widget/guides-home-contract.js",
        "widget/release-runtime.js",
        "control/content/release-manager.js",
        "control/content/migrate-existing-content.js"
    ].forEach((file) => assert.doesNotThrow(() => new Function(fs.readFileSync(path.join(root, file), "utf8")), file));
});

test("mobile widget packages the exact Guides Home contract", () => {
    const normalize = (source) => source.replace(/\r\n/g, "\n");
    const sharedContract = normalize(fs.readFileSync(path.join(root, "shared/guides-home-contract.js"), "utf8"));
    const widgetContract = normalize(fs.readFileSync(path.join(root, "widget/guides-home-contract.js"), "utf8"));
    const widgetHtml = fs.readFileSync(path.join(root, "widget/index.html"), "utf8");

    assert.equal(widgetContract, sharedContract);
    assert.match(widgetHtml, /<script src="guides-home-contract\.js"><\/script>/);
    assert.doesNotMatch(widgetHtml, /<script src="\.\.\/shared\/guides-home-contract\.js"><\/script>/);
});

test("widget and control inline JavaScript parses", () => {
    ["widget/index.html", "control/content/index.html", "guias-interativo.html"].forEach((file) => {
        const html = fs.readFileSync(path.join(root, file), "utf8");
        const scripts = Array.from(html.matchAll(/^\s*<script\b([^>]*)>([\s\S]*?)<\/script>/gim))
            .filter((match) => !/\bsrc\s*=|type\s*=\s*["']application\/json/i.test(match[1]))
            .map((match) => match[2]).filter((source) => source.trim());
        scripts.forEach((source, index) => assert.doesNotThrow(() => new Function(source), file + " inline script " + (index + 1)));
    });
});

test("widget completion code has no legacy userData writes", () => {
    ["widget/release-runtime.js", "widget/index.html"].forEach((file) => {
        const source = fs.readFileSync(path.join(root, file), "utf8");
        assert.equal(/userData\s*\.\s*save\s*\(/.test(source), false, file);
    });
});

test("widget contains no temporary diagnostic alerts", () => {
    const source = fs.readFileSync(path.join(root, "widget/release-runtime.js"), "utf8");
    assert.equal(/\b(?:window|global)?\.?alert\s*\(/.test(source), false);
    assert.equal(source.includes("progressDiagnostic"), false);
});

test("editing a guide preserves its position in ordered journey references", () => {
    const source = fs.readFileSync(path.join(root, "control/content/index.html"), "utf8");
    const start = source.indexOf("function replaceOrderedReference(");
    const end = source.indexOf("function syncJourneyReferencesForLesson(", start);
    const replaceOrderedReference = new Function(
        source.slice(start, end) + "; return replaceOrderedReference;"
    )();
    const removeIds = new Set(["guide-b"]);
    assert.deepEqual(
        replaceOrderedReference(["guide-a", "guide-b", "guide-c"], removeIds, "guide-b", true),
        ["guide-a", "guide-b", "guide-c"]
    );
    assert.deepEqual(
        replaceOrderedReference(["guide-a", "guide-c"], removeIds, "guide-b", true),
        ["guide-a", "guide-c", "guide-b"]
    );
    assert.deepEqual(
        replaceOrderedReference(["guide-a", "guide-b", "guide-c"], removeIds, "guide-b", false),
        ["guide-a", "guide-c"]
    );
});

test("category metadata is synchronized when only its label, subtitle, or icon changes", async () => {
    const source = fs.readFileSync(path.join(root, 'control/content/index.html'), 'utf8');
    const start = source.indexOf('            async function syncLessonOrganizationMetadata(');
    const end = source.indexOf('            async function handleJourneySave(', start);
    const lesson = { _recordId: 'record-a', slug: 'guide-a', listThemeKey: 'category-a',
        listThemeLabel: 'Old title', listThemeSubtitle: 'Old subtitle', listThemeIcon: 'book',
        phaseKeys: ['6'], journeySectionKey: '6' };
    const writes = [];
    const sync = new Function('state', 'AGE_KEYS', 'updateLesson',
        source.slice(start, end) + '; return syncLessonOrganizationMetadata;')(
        { lessons: [lesson] }, ['6'], async (id, data) => writes.push({ id, data }));
    const journey = { listThemes: [{ key: 'category-a', label: 'New title', subtitle: 'New subtitle',
        icon: 'leaf', lessonIds: ['guide-a'] }], phaseHighlights: { 6: ['guide-a'] },
        sections: [{ id: '6', lessonIds: ['guide-a'] }] };
    await sync(journey);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].data.listThemeLabel, 'New title');
    assert.equal(writes[0].data.listThemeSubtitle, 'New subtitle');
    assert.equal(writes[0].data.listThemeIcon, 'leaf');
    Object.assign(lesson, writes[0].data);
    await sync(journey);
    assert.equal(writes.length, 1, 'unchanged metadata does not trigger another write');
});
