(function (root, factory) {
    "use strict";
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) root.GuidesHomeContract = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";

    const SCHEMA_VERSION = 1;
    const MIGRATION_VERSION = 1;
    const ID_PATTERN = /^[a-zA-Z0-9._-]{1,120}$/;

    function cleanIdentity(value) {
        const text = String(value == null ? "" : value).trim();
        return text ? encodeURIComponent(text).replace(/[!'()*]/g, (character) =>
            "%" + character.charCodeAt(0).toString(16).toUpperCase()) : null;
    }

    function catalogTag(instanceId) {
        const instance = cleanIdentity(instanceId);
        return instance ? "guides-compact-catalog-v1-" + instance : null;
    }

    function progressTag(instanceId, userId) {
        const instance = cleanIdentity(instanceId);
        const user = cleanIdentity(userId);
        return instance && user ? "guides-reading-progress-v1-" + instance + "-" + user : null;
    }

    function stableId(value) {
        const id = String(value == null ? "" : value).trim();
        return ID_PATTERN.test(id) ? id : null;
    }

    function fragmentId(value) {
        let id = String(value == null ? "" : value).trim().replace(/^#/, "");
        try { id = decodeURIComponent(id); } catch (error) {}
        return id && id.length <= 180 && !/[\u0000-\u001f\u007f]/.test(id) ? id : null;
    }

    function normalizeCallOuts(values, legacyTitle, legacyAnchor) {
        const source = Array.isArray(values) ? values : [];
        const normalized = source.map((item) => {
            const title = String(item && (item.title || item.callOut) || "").trim();
            const anchor = fragmentId(item && (item.anchor || item.callOutAnchor));
            return title ? { title, ...(anchor ? { anchor } : {}) } : null;
        }).filter(Boolean);
        if (!normalized.length) {
            const title = String(legacyTitle || "").trim();
            const anchor = fragmentId(legacyAnchor);
            if (title) normalized.push({ title, ...(anchor ? { anchor } : {}) });
        }
        return normalized;
    }

    function isEmptyRecord(value) {
        return !value || (typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0);
    }

    function normalizeIds(values) {
        const result = [];
        const seen = new Set();
        (Array.isArray(values) ? values : []).forEach((value) => {
            const id = stableId(value);
            if (id && !seen.has(id)) {
                seen.add(id);
                result.push(id);
            }
        });
        return result;
    }

    function normalizeQuizScores(value) {
        if (!value || typeof value !== "object" || Array.isArray(value)) return {};
        const result = {};
        Object.keys(value).sort().forEach((key) => {
            const id = stableId(key);
            const score = value[key];
            if (!id || !score || typeof score !== "object" || Array.isArray(score)) return;
            const clean = {};
            ["hits", "total", "plays"].forEach((field) => {
                const number = Number(score[field]);
                if (Number.isFinite(number) && number >= 0) clean[field] = Math.floor(number);
            });
            if (Object.keys(clean).length) result[id] = clean;
        });
        return result;
    }

    function legacyCompletion(data) {
        const source = data && typeof data === "object" ? data : {};
        const preferences = source.preferences && typeof source.preferences === "object" ? source.preferences : {};
        return {
            readGuideIds: normalizeIds([
                ...(source.readGuideIds || []),
                ...(source.readGuides || []),
                ...(source.readLessons || [])
            ]),
            completedQuizIds: normalizeIds([
                ...(source.completedQuizIds || []),
                ...(source.completedQuizzes || []),
                ...(preferences.completedQuizIds || []),
                ...(preferences.completedQuizzes || [])
            ]),
            quizScores: normalizeQuizScores(source.quizScores || preferences.quizScores)
        };
    }

    function blankProgress(instanceId, userId) {
        return {
            schemaVersion: SCHEMA_VERSION,
            sourceInstanceId: String(instanceId),
            userId: String(userId),
            readGuideIds: [],
            completedQuizIds: [],
            quizScores: {},
            revision: 0,
            updatedAt: null,
            migrationVersion: 0,
            migratedFromUserDataAt: null
        };
    }

    function normalizeProgress(value, instanceId, userId) {
        if (!value || typeof value !== "object" || Array.isArray(value)) return null;
        if (Number(value.schemaVersion) !== SCHEMA_VERSION) return null;
        if (String(value.sourceInstanceId || "") !== String(instanceId || "") ||
            String(value.userId || "") !== String(userId || "")) return null;
        const result = blankProgress(instanceId, userId);
        result.readGuideIds = normalizeIds(value.readGuideIds);
        result.completedQuizIds = normalizeIds(value.completedQuizIds);
        result.quizScores = normalizeQuizScores(value.quizScores);
        result.revision = Math.max(0, Math.floor(Number(value.revision) || 0));
        result.updatedAt = typeof value.updatedAt === "string" ? value.updatedAt : null;
        result.migrationVersion = Math.max(0, Math.floor(Number(value.migrationVersion) || 0));
        result.migratedFromUserDataAt = typeof value.migratedFromUserDataAt === "string"
            ? value.migratedFromUserDataAt : null;
        return result;
    }

    function mergeCompletion(progress, completion) {
        const next = { ...progress };
        next.readGuideIds = normalizeIds([...(progress.readGuideIds || []), ...(completion.readGuideIds || [])]);
        next.completedQuizIds = normalizeIds([...(progress.completedQuizIds || []), ...(completion.completedQuizIds || [])]);
        next.quizScores = { ...normalizeQuizScores(completion.quizScores), ...normalizeQuizScores(progress.quizScores) };
        return next;
    }

    function migrateProgress(progress, legacy, anonymous, now) {
        let next = { ...progress };
        if (next.migrationVersion < MIGRATION_VERSION) {
            next = mergeCompletion(next, legacyCompletion(legacy));
            next.migrationVersion = MIGRATION_VERSION;
            next.migratedFromUserDataAt = now || new Date().toISOString();
        }
        return mergeCompletion(next, anonymous || {});
    }

    function setCompleted(progress, type, idValue, completed) {
        const id = stableId(idValue);
        if (!id || !["guide", "quiz"].includes(type)) throw new Error("A valid completion type and stable ID are required.");
        const field = type === "quiz" ? "completedQuizIds" : "readGuideIds";
        const ids = new Set(normalizeIds(progress[field]));
        completed === false ? ids.delete(id) : ids.add(id);
        return { ...progress, [field]: Array.from(ids) };
    }

    function activeJourney(journeyData) {
        const source = journeyData && typeof journeyData === "object" ? journeyData : {};
        const journeys = (Array.isArray(source.journeys) ? source.journeys : [])
            .filter((journey) => journey && journey.published !== false);
        return journeys.find((journey) => journey.id === source.defaultJourneyId) || journeys[0] || null;
    }

    function ageForGuide(guide, journey) {
        const ages = [];
        const highlights = journey && journey.phaseHighlights && typeof journey.phaseHighlights === "object"
            ? journey.phaseHighlights : {};
        Object.keys(highlights).forEach((key) => {
            if (Array.isArray(highlights[key]) && highlights[key].includes(guide.slug)) {
                const age = Number(key);
                if (Number.isFinite(age) && age >= 0) ages.push(age);
            }
        });
        (Array.isArray(guide.phaseKeys) ? guide.phaseKeys : []).forEach((key) => {
            const age = Number(key);
            if (Number.isFinite(age) && age >= 0) ages.push(age);
        });
        return ages.length ? Math.min(...ages) : null;
    }

    function catalogItems(lessons, quizzes, journeyData) {
        const guides = new Map((Array.isArray(lessons) ? lessons : [])
            .filter((guide) => guide && guide.published !== false && stableId(guide.slug) && String(guide.title || "").trim())
            .map((guide) => [guide.slug, guide]));
        const publishedQuizzes = (Array.isArray(quizzes) ? quizzes : [])
            .filter((quiz) => quiz && quiz.published !== false && stableId(quiz.id) && String(quiz.title || "").trim());
        const journey = activeJourney(journeyData);
        const orderedGuideIds = [];
        const stageByGuide = new Map();
        const seenGuides = new Set();
        (journey && Array.isArray(journey.sections) ? journey.sections : []).forEach((section) => {
            (Array.isArray(section.lessonIds) ? section.lessonIds : []).forEach((id) => {
                if (!guides.has(id) || seenGuides.has(id)) return;
                seenGuides.add(id);
                orderedGuideIds.push(id);
                const stage = String(section.title || "").trim();
                if (stage) stageByGuide.set(id, stage);
            });
        });
        Array.from(guides.keys()).filter((id) => !seenGuides.has(id)).sort().forEach((id) => orderedGuideIds.push(id));

        const quizzesByGuide = new Map();
        const unanchored = [];
        publishedQuizzes.forEach((quiz) => {
            const anchor = stableId(quiz.afterGuideId || quiz.sourceGuideId);
            if (!anchor || !guides.has(anchor)) return unanchored.push(quiz);
            if (!quizzesByGuide.has(anchor)) quizzesByGuide.set(anchor, []);
            quizzesByGuide.get(anchor).push(quiz);
        });
        quizzesByGuide.forEach((values) => values.sort((a, b) => a.id.localeCompare(b.id)));
        unanchored.sort((a, b) => a.id.localeCompare(b.id));

        const items = [];
        function add(type, id, title, minimumAgeMonths, stage, callOut, callOutAnchor, callOuts) {
            const item = { id, type, title: String(title).trim(), minimumAgeMonths, sequence: items.length + 1, published: true };
            if (stage) item.stage = stage;
            const homeCallOuts = normalizeCallOuts(callOuts, callOut, callOutAnchor);
            if (homeCallOuts.length) {
                item.callOuts = homeCallOuts;
                item.callOut = homeCallOuts[0].title;
                if (homeCallOuts[0].anchor) item.callOutAnchor = homeCallOuts[0].anchor;
            }
            items.push(item);
        }
        orderedGuideIds.forEach((id) => {
            const guide = guides.get(id);
            const age = ageForGuide(guide, journey);
            const stage = stageByGuide.get(id);
            add("guide", id, guide.title, age, stage, guide.callOut, guide.callOutAnchor, guide.callOuts);
            (quizzesByGuide.get(id) || []).forEach((quiz) => add("quiz", quiz.id, quiz.title, age, stage));
        });
        unanchored.forEach((quiz) => add("quiz", quiz.id, quiz.title, null, undefined));
        return items;
    }

    function materialCatalog(value) {
        return JSON.stringify({
            schemaVersion: value && value.schemaVersion,
            sourceInstanceId: value && value.sourceInstanceId,
            items: value && value.items
        });
    }

    function buildCatalog(lessons, quizzes, journeyData, instanceId, previous, now) {
        const sourceInstanceId = String(instanceId == null ? "" : instanceId).trim();
        if (!sourceInstanceId) throw new Error("A BuildFire instanceId is required to build the Guides catalog.");
        const candidate = {
            schemaVersion: SCHEMA_VERSION,
            sourceInstanceId,
            revision: 1,
            updatedAt: now || new Date().toISOString(),
            items: catalogItems(lessons, quizzes, journeyData)
        };
        if (previous && materialCatalog(previous) === materialCatalog(candidate)) return null;
        candidate.revision = Math.max(0, Math.floor(Number(previous && previous.revision) || 0)) + 1;
        return candidate;
    }

    function normalizeDeepLink(value) {
        const data = value && value.deeplinkData ? value.deeplinkData : value;
        if (!data || typeof data !== "object") return null;
        const origin = data.origin === "app-home" ? "app-home" : undefined;
        if (data.type === "quiz") {
            const quizId = stableId(data.quizId);
            return quizId ? { type: "quiz", quizId, ...(origin ? { origin } : {}) } : null;
        }
        if (data.type && data.type !== "guide") return null;
        const guideId = stableId(data.guideId || data.slug);
        const anchor = fragmentId(data.anchor);
        return guideId ? { type: "guide", guideId, ...(origin ? { origin } : {}), ...(anchor ? { anchor } : {}) } : null;
    }

    function homeBackTarget(deepLink, activeScreen) {
        const normalized = normalizeDeepLink(deepLink);
        return normalized && normalized.origin === "app-home" && ["reader", "quiz-play"].includes(activeScreen)
            ? "landing" : null;
    }

    function serializeMutations(loadLatest, save, now) {
        let queue = Promise.resolve();
        return function mutate(operation) {
            const task = queue.then(async () => {
                const latest = await loadLatest();
                const next = await operation(latest);
                next.revision = Math.max(0, Math.floor(Number(latest.revision) || 0)) + 1;
                next.updatedAt = (now || (() => new Date().toISOString()))();
                await save(next);
                return next;
            });
            queue = task.catch(() => {});
            return task;
        };
    }

    return {
        SCHEMA_VERSION,
        MIGRATION_VERSION,
        catalogTag,
        progressTag,
        stableId,
        fragmentId,
        normalizeCallOuts,
        isEmptyRecord,
        normalizeIds,
        normalizeQuizScores,
        legacyCompletion,
        blankProgress,
        normalizeProgress,
        mergeCompletion,
        migrateProgress,
        setCompleted,
        catalogItems,
        buildCatalog,
        normalizeDeepLink,
        homeBackTarget,
        serializeMutations
    };
}));
