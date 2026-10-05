"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Contract = require("../shared/guides-home-contract");

const lessons = [
    {
        slug: "first-guide", title: "First", published: true, phaseKeys: ["6"],
        callOuts: [
            { title: "Start solids with confidence", anchor: "first-foods" },
            { title: "Build a calm mealtime", anchor: "calm-mealtime" }
        ]
    },
    { slug: "ageless-guide", title: "Any age", published: true, phaseKeys: [] },
    { slug: "draft-guide", title: "Draft", published: false, phaseKeys: ["7"] }
];
const quizzes = [
    { id: "quiz-b", title: "Quiz B", afterGuideId: "first-guide", published: true },
    { id: "quiz-a", title: "Quiz A", afterGuideId: "first-guide", published: true },
    { id: "quiz-draft", title: "Draft quiz", afterGuideId: "first-guide", published: false }
];
const journeyData = {
    defaultJourneyId: "main",
    journeys: [{
        id: "main", published: true,
        sections: [
            { id: "base", title: "The basics", lessonIds: ["ageless-guide"] },
            { id: "six", title: "6–8 months", lessonIds: ["first-guide"] }
        ],
        phaseHighlights: { "6": ["first-guide"], "8": ["first-guide"] }
    }]
};

test("constructs encoded versioned tags and rejects missing identities", () => {
    assert.equal(Contract.catalogTag("instance / one"), "guides-compact-catalog-v1-instance%20%2F%20one");
    assert.equal(Contract.progressTag("instance / one", "user@example.com"),
        "guides-reading-progress-v1-instance%20%2F%20one-user%40example.com");
    assert.equal(Contract.catalogTag(""), null);
    assert.equal(Contract.progressTag("instance", ""), null);
    assert.equal(Contract.progressTag(null, "user"), null);
    assert.equal(Contract.isEmptyRecord(null), true);
    assert.equal(Contract.isEmptyRecord({}), true);
    assert.equal(Contract.isEmptyRecord({ schemaVersion: 1 }), false);
});

test("builds a compact published-only catalog with stable IDs, ages, stages, and deterministic sequence", () => {
    const catalog = Contract.buildCatalog(lessons, quizzes, journeyData, "instance-1", null, "2026-09-18T10:00:00.000Z");
    assert.deepEqual(catalog.items, [
        { id: "ageless-guide", type: "guide", title: "Any age", minimumAgeMonths: null, sequence: 1, published: true, stage: "The basics" },
        {
            id: "first-guide", type: "guide", title: "First", minimumAgeMonths: 6, sequence: 2, published: true, stage: "6–8 months",
            callOuts: [
                { title: "Start solids with confidence", anchor: "first-foods" },
                { title: "Build a calm mealtime", anchor: "calm-mealtime" }
            ],
            callOut: "Start solids with confidence", callOutAnchor: "first-foods"
        },
        { id: "quiz-a", type: "quiz", title: "Quiz A", minimumAgeMonths: 6, sequence: 3, published: true, stage: "6–8 months" },
        { id: "quiz-b", type: "quiz", title: "Quiz B", minimumAgeMonths: 6, sequence: 4, published: true, stage: "6–8 months" }
    ]);
    assert.equal(catalog.items.some((item) => item.id.includes("draft")), false);
    assert.equal(catalog.items.some((item) => "bodyHtml" in item || "questions" in item), false);
});

test("does not rewrite a materially unchanged catalog and increments changed revisions", () => {
    const first = Contract.buildCatalog(lessons, quizzes, journeyData, "instance-1", null, "2026-09-18T10:00:00.000Z");
    assert.equal(Contract.buildCatalog(lessons, quizzes, journeyData, "instance-1", first, "later"), null);
    const changed = Contract.buildCatalog([...lessons, { slug: "last", title: "Last", published: true }], quizzes,
        journeyData, "instance-1", first, "2026-09-18T11:00:00.000Z");
    assert.equal(changed.revision, 2);
    assert.equal(changed.items.at(-1).id, "last");
});

test("normalizes and deduplicates completion IDs and rejects identity mismatches", () => {
    const value = {
        schemaVersion: 1, sourceInstanceId: "i", userId: "u", revision: 4,
        readGuideIds: ["one", "one", " bad id ", "two"],
        completedQuizIds: ["quiz.one", "quiz.one", null]
    };
    const normalized = Contract.normalizeProgress(value, "i", "u");
    assert.deepEqual(normalized.readGuideIds, ["one", "two"]);
    assert.deepEqual(normalized.completedQuizIds, ["quiz.one"]);
    assert.equal(Contract.normalizeProgress({ ...value, schemaVersion: 2 }, "i", "u"), null);
    assert.equal(Contract.normalizeProgress(value, "other", "u"), null);
    assert.equal(Contract.normalizeProgress(value, "i", "other"), null);
});

test("completes and uncompletes guides and quizzes", () => {
    let progress = Contract.blankProgress("i", "u");
    progress = Contract.setCompleted(progress, "guide", "guide-1", true);
    progress = Contract.setCompleted(progress, "quiz", "quiz-1", true);
    progress = Contract.setCompleted(progress, "guide", "guide-1", false);
    assert.deepEqual(progress.readGuideIds, []);
    assert.deepEqual(progress.completedQuizIds, ["quiz-1"]);
});

test("serializes rapid mutations and reloads the latest document before each save", async () => {
    let remote = Contract.blankProgress("i", "u");
    const events = [];
    const mutate = Contract.serializeMutations(
        async () => { events.push("load"); return structuredClone(remote); },
        async (next) => { events.push("save:" + next.revision); remote = structuredClone(next); },
        () => "2026-09-18T10:00:00.000Z"
    );
    await Promise.all([
        mutate((latest) => Contract.setCompleted(latest, "guide", "one", true)),
        mutate((latest) => Contract.setCompleted(latest, "guide", "two", true)),
        mutate((latest) => Contract.setCompleted(latest, "quiz", "quiz-one", true))
    ]);
    assert.deepEqual(remote.readGuideIds, ["one", "two"]);
    assert.deepEqual(remote.completedQuizIds, ["quiz-one"]);
    assert.equal(remote.revision, 3);
    assert.deepEqual(events, ["load", "save:1", "load", "save:2", "load", "save:3"]);
});

test("merges anonymous and one-time legacy completion without losing existing appData", () => {
    const remote = {
        ...Contract.blankProgress("i", "u"),
        readGuideIds: ["remote-guide"], completedQuizIds: ["remote-quiz"],
        quizScores: { "remote-quiz": { hits: 4, total: 5, plays: 2 } }
    };
    const legacy = {
        readGuides: ["legacy-guide", "remote-guide"],
        completedQuizzes: ["legacy-quiz"],
        preferences: { quizScores: { "remote-quiz": { hits: 1, total: 5, plays: 1 }, "legacy-quiz": { hits: 2, total: 3 } } }
    };
    const first = Contract.migrateProgress(remote, legacy,
        { readGuideIds: ["anonymous-guide"], completedQuizIds: ["anonymous-quiz"] }, "2026-09-18T10:00:00.000Z");
    assert.deepEqual(first.readGuideIds, ["remote-guide", "legacy-guide", "anonymous-guide"]);
    assert.deepEqual(first.completedQuizIds, ["remote-quiz", "legacy-quiz", "anonymous-quiz"]);
    assert.deepEqual(first.quizScores["remote-quiz"], { hits: 4, total: 5, plays: 2 });
    assert.equal(first.migrationVersion, 1);
    const repeated = Contract.migrateProgress(first, { readGuides: ["should-not-repeat"] }, {}, "later");
    assert.equal(repeated.readGuideIds.includes("should-not-repeat"), false);
    assert.equal(repeated.migratedFromUserDataAt, "2026-09-18T10:00:00.000Z");
});

test("parses guide and quiz Home deep links, preserves origin, and selects landing-first back behavior", () => {
    const guide = Contract.normalizeDeepLink({ type: "guide", guideId: "guide-1", origin: "app-home", anchor: "first-foods" });
    const quiz = Contract.normalizeDeepLink({ deeplinkData: { type: "quiz", quizId: "quiz-1", origin: "app-home" } });
    assert.deepEqual(guide, { type: "guide", guideId: "guide-1", origin: "app-home", anchor: "first-foods" });
    assert.deepEqual(quiz, { type: "quiz", quizId: "quiz-1", origin: "app-home" });
    assert.equal(Contract.homeBackTarget(guide, "reader"), "landing");
    assert.equal(Contract.homeBackTarget(quiz, "quiz-play"), "landing");
    assert.equal(Contract.homeBackTarget({ type: "guide", guideId: "guide-1" }, "reader"), null);
});
