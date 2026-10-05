(function (global) {
    "use strict";

    // Persisted compatibility name: records called "lessons" here are guides in product terminology.
    const LESSON_TAG = "guideLessons";
    const QUIZ_TAG = "guideQuizzes";
    const JOURNEY_TAG = "guideJourneys";
    const JOURNEY_ID = "blw-0-a-2";
    const PAGE_SIZE = 50;

    function requireBuildFire() {
        if (!global.buildfire || !buildfire.datastore) {
            throw new Error("Run this migration inside the BuildFire plugin control iframe.");
        }
    }

    function getData(tag) {
        return new Promise((resolve, reject) => {
            buildfire.datastore.get(tag, (error, result) => {
                if (error) reject(error);
                else resolve(result && result.data ? result.data : null);
            });
        });
    }

    function searchPage(tag, page) {
        return new Promise((resolve, reject) => {
            buildfire.datastore.search({ page, pageSize: PAGE_SIZE }, tag, (error, result) => {
                if (error) reject(error);
                else resolve(Array.isArray(result) ? result : ((result && result.result) || []));
            });
        });
    }

    async function searchAll(tag) {
        const records = [];
        for (let page = 0; ; page += 1) {
            const batch = await searchPage(tag, page);
            records.push(...batch);
            if (batch.length < PAGE_SIZE) break;
        }
        return records;
    }

    function searchAllLessons() {
        return searchAll(LESSON_TAG);
    }

    function searchAllQuizzes() {
        return searchAll(QUIZ_TAG);
    }

    function insertLesson(lesson) {
        return new Promise((resolve, reject) => {
            buildfire.datastore.insert(lesson, LESSON_TAG, false, (error, result) => {
                if (error) reject(error);
                else resolve(result);
            });
        });
    }

    function updateLesson(recordId, lesson) {
        return new Promise((resolve, reject) => {
            buildfire.datastore.update(recordId, lesson, LESSON_TAG, (error, result) => {
                if (error) reject(error);
                else resolve(result);
            });
        });
    }

    function insertQuiz(quiz) {
        return new Promise((resolve, reject) => {
            buildfire.datastore.insert(quiz, QUIZ_TAG, false, (error, result) => {
                if (error) reject(error);
                else resolve(result);
            });
        });
    }

    function updateQuiz(recordId, quiz) {
        return new Promise((resolve, reject) => {
            buildfire.datastore.update(recordId, quiz, QUIZ_TAG, (error, result) => {
                if (error) reject(error);
                else resolve(result);
            });
        });
    }

    function saveJourneys(data) {
        return new Promise((resolve, reject) => {
            buildfire.datastore.save(data, JOURNEY_TAG, (error, result) => {
                if (error) reject(error);
                else resolve(result);
            });
        });
    }

    function declarationIndex(source, name) {
        const match = new RegExp("\\b(?:const|let|var)\\s+" + name + "\\s*=").exec(source);
        if (!match) throw new Error("Migration source is missing declaration: " + name);
        return match.index;
    }

    function findSlice(source, start, endMarkerOrIndex) {
        const end = typeof endMarkerOrIndex === "number" ?
            endMarkerOrIndex : source.indexOf(endMarkerOrIndex, start);
        if (end < 0) throw new Error("Migration source is missing end marker: " + endMarkerOrIndex);
        return source.slice(start, end);
    }

    function evaluateSlice(source, start, endMarker, returnExpression) {
        const code = findSlice(source, start, endMarker);
        // The source is the plugin's checked-in legacy HTML, not user content.
        // Evaluating only its data declaration ranges avoids running its UI,
        // auth, commerce, navigation, or progress code.
        return new Function(code + "\nreturn " + returnExpression + ";")();
    }

    function evaluateGuideData(source) {
        const guideDeclarations = findSlice(
            source,
            declarationIndex(source, "GUIA_O_QUE_E_BLW"),
            declarationIndex(source, "QUIZZES")
        );
        const listThemes = findSlice(
            source,
            declarationIndex(source, "LIST_THEMES"),
            declarationIndex(source, "currentGuides")
        );
        return new Function(
            guideDeclarations + "\n" + listThemes +
            "\nreturn { FUNDAMENTALS, GUIDES_DATA, " +
            "AGELESS_GUIDES: typeof AGELESS_GUIDES === 'undefined' ? [] : AGELESS_GUIDES, " +
            "LIST_THEMES: typeof LIST_THEMES === 'undefined' ? [] : LIST_THEMES };"
        )();
    }

    function extractLegacyData(source) {
        const iconMap = evaluateSlice(
            source,
            declarationIndex(source, "GUIDE_ICON_MAP"),
            "function guideIconId",
            "GUIDE_ICON_MAP"
        );
        const guideData = evaluateGuideData(source);
        const monthlySummary = evaluateSlice(
            source,
            declarationIndex(source, "MONTHLY_SUMMARY"),
            "function openMilestoneSheet",
            "MONTHLY_SUMMARY"
        );
        const phaseLabels = evaluateSlice(
            source,
            declarationIndex(source, "PHASE_LABELS"),
            declarationIndex(source, "ALL_GUIDES_FLAT"),
            "PHASE_LABELS"
        );
        const quizzes = evaluateSlice(
            source,
            declarationIndex(source, "QUIZZES"),
            declarationIndex(source, "QUIZ_BY_GUIDE_ID"),
            "QUIZZES"
        );
        const quizContent = evaluateSlice(
            source,
            source.lastIndexOf("function quizTiers", declarationIndex(source, "QUIZ_CONTENT")),
            declarationIndex(source, "LIST_THEMES"),
            "QUIZ_CONTENT"
        );
        return { iconMap, monthlySummary, phaseLabels, quizzes, quizContent, ...guideData };
    }

    function uniqueGuides(data) {
        const byId = new Map();
        const ordered = [];
        const add = (guide) => {
            if (!guide || !guide.id || byId.has(guide.id)) return;
            byId.set(guide.id, guide);
            ordered.push(guide);
        };
        data.FUNDAMENTALS.forEach(add);
        data.AGELESS_GUIDES.forEach(add);
        Object.values(data.GUIDES_DATA).forEach((guides) => guides.forEach(add));
        return ordered;
    }

    function phaseKeysForGuide(guideId, guidesByPhase) {
        return Object.keys(guidesByPhase).filter((phaseKey) => {
            return guidesByPhase[phaseKey].some((guide) => guide.id === guideId);
        });
    }

    function themeForGuide(guideId, listThemes) {
        const theme = listThemes.find((item) => {
            return item.guides.some((guide) => guide.id === guideId);
        });
        if (!theme) return null;
        return {
            key: theme.key,
            label: theme.label || "",
            subtitle: theme.subtitle || "",
            icon: theme.icon || "leaf"
        };
    }

    function makeLessons(data, migratedAt, sourceName) {
        return uniqueGuides(data).map((guide) => {
            const listTheme = themeForGuide(guide.id, data.LIST_THEMES);
            return {
                schemaVersion: 1,
                slug: guide.id,
                title: guide.title || "",
                summary: guide.summary || "",
                tag: guide.tag || "",
                icon: data.iconMap[guide.id] || "leaf",
                readTime: guide.readTime || "",
                phaseKeys: phaseKeysForGuide(guide.id, data.GUIDES_DATA),
                listThemeKey: listTheme ? listTheme.key : "",
                listThemeLabel: listTheme ? listTheme.label : "",
                listThemeSubtitle: listTheme ? listTheme.subtitle : "",
                listThemeIcon: listTheme ? listTheme.icon : "",
                tldr: Array.isArray(guide.tldr) ? guide.tldr.slice() : [],
                bodyHtml: guide.content || "",
                premium: !!guide.premium,
                published: true,
                migratedFrom: sourceName,
                updatedAt: migratedAt
            };
        });
    }

    function makeQuizzes(data, migratedAt, sourceName) {
        const seen = new Set();
        const lessonIds = new Set(uniqueGuides(data).map((guide) => guide.id));
        return data.quizzes.map((metadata) => {
            if (!metadata || !metadata.id) throw new Error("Quiz metadata is missing a stable ID.");
            if (seen.has(metadata.id)) throw new Error("Duplicate quiz stable ID: " + metadata.id);
            seen.add(metadata.id);
            const content = data.quizContent[metadata.id];
            if (!content) throw new Error("Quiz is missing playable content: " + metadata.id);
            const referencedGuideIds = [
                metadata.afterGuideId,
                ...(Array.isArray(metadata.alsoAfterGuideIds) ? metadata.alsoAfterGuideIds : []),
                content.sourceGuideId
            ].filter(Boolean);
            const unknownGuideId = referencedGuideIds.find((id) => !lessonIds.has(id));
            if (unknownGuideId) {
                throw new Error("Quiz " + metadata.id + " references an unknown guide: " + unknownGuideId);
            }
            const questions = Array.isArray(content.questions) ? content.questions : [];
            if (!questions.length) throw new Error("Quiz has no questions: " + metadata.id);
            if (Number(metadata.questions) !== questions.length) {
                throw new Error(
                    "Quiz question count mismatch for " + metadata.id +
                    ": metadata says " + metadata.questions + ", content has " + questions.length + "."
                );
            }
            const validateQuestion = (question, label) => {
                if (!Array.isArray(question.options) || question.options.length < 2) {
                    throw new Error("Quiz " + metadata.id + " " + label + " needs at least two options.");
                }
                if (!Number.isInteger(question.correct) || question.correct < 0 || question.correct >= question.options.length) {
                    throw new Error("Quiz " + metadata.id + " " + label + " has an invalid correct answer index.");
                }
            };
            questions.forEach((question, index) => validateQuestion(question, "question " + (index + 1)));
            if (content.bonus) validateQuestion(content.bonus, "bonus question");
            if (!Array.isArray(content.results) || content.results.length !== 4) {
                throw new Error("Quiz " + metadata.id + " must define four result tiers.");
            }
            return {
                schemaVersion: 1,
                id: metadata.id,
                title: metadata.title || "",
                questionCount: questions.length,
                afterGuideId: metadata.afterGuideId || "",
                alsoAfterGuideIds: Array.isArray(metadata.alsoAfterGuideIds) ? metadata.alsoAfterGuideIds.slice() : [],
                sourceGuideId: content.sourceGuideId || metadata.afterGuideId || "",
                intro: content.intro || {},
                questions,
                bonus: content.bonus || null,
                results: Array.isArray(content.results) ? content.results : [],
                published: true,
                migratedFrom: sourceName,
                updatedAt: migratedAt
            };
        });
    }

    function listHtml(items) {
        if (!Array.isArray(items) || !items.length) return "";
        return "<ul>" + items.map((item) => "<li>" + String(item) + "</li>").join("") + "</ul>";
    }

    function makeMilestones(monthlySummary) {
        return Object.keys(monthlySummary).reduce((result, phaseKey) => {
            const milestone = monthlySummary[phaseKey] || {};
            result[phaseKey] = {
                title: milestone.title || "",
                expectHtml: listHtml(milestone.esperar),
                rememberHtml: listHtml(milestone.lembrese),
                esperar: Array.isArray(milestone.esperar) ? milestone.esperar.slice() : [],
                lembrese: Array.isArray(milestone.lembrese) ? milestone.lembrese.slice() : []
            };
            return result;
        }, {});
    }

    function makeJourney(data, sourceName) {
        const seen = new Set();
        const sections = [];
        const addSection = (id, title, icon, guides, subtitle) => {
            const lessonIds = guides.map((guide) => guide.id).filter((id) => {
                if (seen.has(id)) return false;
                seen.add(id);
                return true;
            });
            if (lessonIds.length) {
                sections.push({
                    id,
                    title,
                    subtitle: subtitle || "",
                    icon: icon || "leaf",
                    lessonIds
                });
            }
        };

        // Keep these section IDs compatible with the already-uploaded CMS
        // shell. It reconstructs fundamentals, ageless guides and the age
        // journey from these IDs plus phaseHighlights.
        addSection("fundamentals", "A Base do BLW", "leaf", data.FUNDAMENTALS);
        if (data.AGELESS_GUIDES.length) {
            addSection("ageless", "Praticidade", "sparkle", data.AGELESS_GUIDES);
        }
        Object.keys(data.GUIDES_DATA).forEach((phaseKey) => {
            const meta = data.phaseLabels[phaseKey] || {};
            addSection(phaseKey, meta.label || phaseKey + " meses", meta.icon || "leaf", data.GUIDES_DATA[phaseKey]);
        });

        // LIST_THEMES is a second, thematic axis used by the new Lista tab.
        // Store it separately so it does not replace the age journey above.
        const listThemes = data.LIST_THEMES.map((theme, index) => ({
            key: theme.key,
            label: theme.label || "",
            subtitle: theme.subtitle || "",
            icon: theme.icon || "leaf",
            order: index,
            lessonIds: theme.guides.map((guide) => guide.id)
        }));

        const phaseHighlights = Object.keys(data.GUIDES_DATA).reduce((result, phaseKey) => {
            result[phaseKey] = data.GUIDES_DATA[phaseKey].map((guide) => guide.id);
            return result;
        }, {});

        return {
            schemaVersion: 1,
            id: JOURNEY_ID,
            title: "Sua trilha do 0 aos 2 anos",
            description: "Todos os guias organizados em ordem, como um mapa. Você pode ler qualquer um a qualquer momento.",
            published: true,
            sections,
            listThemes,
            phaseHighlights,
            milestones: makeMilestones(data.monthlySummary),
            migratedFrom: sourceName
        };
    }

    function sourceNameFromUrl(sourceUrl) {
        const cleanUrl = String(sourceUrl || "").split(/[?#]/)[0];
        const segments = cleanUrl.split("/").filter(Boolean);
        return segments[segments.length - 1] || "legacy-guides.html";
    }

    function recordData(record) {
        return record && record.data ? record.data : record;
    }

    function recordId(record) {
        return record && (record.id || record._id);
    }

    function indexExistingRecords(records, key, label) {
        const byStableId = new Map();
        records.forEach((record) => {
            const data = recordData(record);
            if (!data || !data[key]) return;
            if (byStableId.has(data[key])) {
                throw new Error("Duplicate datastore records already exist for " + label + ": " + data[key]);
            }
            byStableId.set(data[key], record);
        });
        return byStableId;
    }

    function indexExistingLessons(records) {
        return indexExistingRecords(records, "slug", "guide slug");
    }

    function indexExistingQuizzes(records) {
        return indexExistingRecords(records, "id", "quiz ID");
    }

    async function mapWithConcurrency(items, concurrency, worker) {
        let nextIndex = 0;
        const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
            while (nextIndex < items.length) {
                const index = nextIndex;
                nextIndex += 1;
                await worker(items[index], index);
            }
        });
        await Promise.all(workers);
    }

    function logProgress(options, message, detail) {
        if (typeof options.onProgress === "function") options.onProgress(message, detail);
        console.log("[guides migration] " + message, detail || "");
    }

    async function loadSource(sourceUrl) {
        const response = await fetch(sourceUrl, { cache: "no-store" });
        if (!response.ok) {
            throw new Error("Could not load migration source " + sourceUrl + " (" + response.status + ").");
        }
        return response.text();
    }

    async function migrateExistingGuideContent(options) {
        requireBuildFire();
        options = {
            sourceUrl: "../../guias-interativo-new.html",
            dryRun: false,
            overwriteExisting: false,
            quizOnly: false,
            concurrency: 3,
            ...options
        };

        logProgress(options, "Loading legacy guide source.");
        const source = await loadSource(options.sourceUrl);
        const extracted = extractLegacyData(source);
        const migratedAt = new Date().toISOString();
        const sourceName = sourceNameFromUrl(options.sourceUrl);
        const lessons = makeLessons(extracted, migratedAt, sourceName);
        const quizzes = makeQuizzes(extracted, migratedAt, sourceName);
        const journey = makeJourney(extracted, sourceName);
        const [existingRecords, existingQuizRecords] = await Promise.all([
            searchAllLessons(),
            searchAllQuizzes()
        ]);
        const existingBySlug = indexExistingLessons(existingRecords);
        const existingQuizzesById = indexExistingQuizzes(existingQuizRecords);
        const existingJourneyData = await getData(JOURNEY_TAG) || { schemaVersion: 1, journeys: [] };
        const existingJourneys = Array.isArray(existingJourneyData.journeys) ? existingJourneyData.journeys.slice() : [];
        const existingJourneyIndex = existingJourneys.findIndex((item) => item.id === JOURNEY_ID);

        const plan = {
            lessonCount: options.quizOnly ? 0 : lessons.length,
            insertCount: options.quizOnly ? 0 : lessons.filter((lesson) => !existingBySlug.has(lesson.slug)).length,
            updateCount: !options.quizOnly && options.overwriteExisting ?
                lessons.filter((lesson) => existingBySlug.has(lesson.slug)).length : 0,
            skipCount: options.quizOnly ? 0 : (options.overwriteExisting ? 0 :
                lessons.filter((lesson) => existingBySlug.has(lesson.slug)).length),
            quizCount: quizzes.length,
            quizInsertCount: quizzes.filter((quiz) => !existingQuizzesById.has(quiz.id)).length,
            quizUpdateCount: options.overwriteExisting ?
                quizzes.filter((quiz) => existingQuizzesById.has(quiz.id)).length : 0,
            quizSkipCount: options.overwriteExisting ? 0 :
                quizzes.filter((quiz) => existingQuizzesById.has(quiz.id)).length,
            journeyAction: options.quizOnly ? "skip" : (existingJourneyIndex < 0 ? "insert" :
                (options.overwriteExisting ? "update" : "skip")
            )
        };

        logProgress(options, options.dryRun ? "Dry-run plan ready." : "Migration plan ready.", plan);
        if (options.dryRun) return { lessons, quizzes, journey, plan };

        const results = {
            inserted: [], updated: [], skipped: [],
            quizzesInserted: [], quizzesUpdated: [], quizzesSkipped: [],
            journeyAction: plan.journeyAction
        };
        await mapWithConcurrency(options.quizOnly ? [] : lessons, options.concurrency, async (lesson, index) => {
            const existing = existingBySlug.get(lesson.slug);
            if (existing && !options.overwriteExisting) {
                results.skipped.push(lesson.slug);
                logProgress(options, "Skipped existing guide " + (index + 1) + "/" + lessons.length + ": " + lesson.slug);
                return;
            }
            if (existing) {
                const id = recordId(existing);
                if (!id) throw new Error("Existing guide has no datastore ID: " + lesson.slug);
                await updateLesson(id, lesson);
                results.updated.push(lesson.slug);
                logProgress(options, "Updated guide " + (index + 1) + "/" + lessons.length + ": " + lesson.slug);
            } else {
                await insertLesson(lesson);
                results.inserted.push(lesson.slug);
                logProgress(options, "Inserted guide " + (index + 1) + "/" + lessons.length + ": " + lesson.slug);
            }
        });

        await mapWithConcurrency(quizzes, options.concurrency, async (quiz, index) => {
            const existing = existingQuizzesById.get(quiz.id);
            if (existing && !options.overwriteExisting) {
                results.quizzesSkipped.push(quiz.id);
                logProgress(options, "Skipped existing quiz " + (index + 1) + "/" + quizzes.length + ": " + quiz.id);
                return;
            }
            if (existing) {
                const id = recordId(existing);
                if (!id) throw new Error("Existing quiz has no datastore ID: " + quiz.id);
                await updateQuiz(id, quiz);
                results.quizzesUpdated.push(quiz.id);
                logProgress(options, "Updated quiz " + (index + 1) + "/" + quizzes.length + ": " + quiz.id);
            } else {
                await insertQuiz(quiz);
                results.quizzesInserted.push(quiz.id);
                logProgress(options, "Inserted quiz " + (index + 1) + "/" + quizzes.length + ": " + quiz.id);
            }
        });

        if (existingJourneyIndex < 0) {
            existingJourneys.push(journey);
        } else if (options.overwriteExisting) {
            existingJourneys.splice(existingJourneyIndex, 1, journey);
        }

        if (plan.journeyAction !== "skip") {
            await saveJourneys({
                ...existingJourneyData,
                schemaVersion: 1,
                defaultJourneyId: existingJourneyData.defaultJourneyId || JOURNEY_ID,
                journeys: existingJourneys,
                updatedAt: migratedAt
            });
            logProgress(options, "Saved migrated journey: " + JOURNEY_ID);
        } else {
            logProgress(options, "Preserved existing journey: " + JOURNEY_ID);
        }

        if (!global.GuidesCatalogSync || typeof global.GuidesCatalogSync.syncFromDatastore !== "function") {
            throw new Error("Home catalog synchronization is unavailable.");
        }
        await global.GuidesCatalogSync.syncFromDatastore();
        logProgress(options, "Synchronized the Home compact catalog.");

        logProgress(options, "Migration complete.", results);
        return { lessons, quizzes, journey, plan, results };
    }

    global.migrateExistingGuideContent = migrateExistingGuideContent;
    global.importNewGuideData = function (options) {
        return migrateExistingGuideContent({ overwriteExisting: true, ...(options || {}) });
    };
    global.importNewQuizData = function (options) {
        return migrateExistingGuideContent({ overwriteExisting: true, quizOnly: true, ...(options || {}) });
    };
    console.info(
        "Guide import loaded. Run importNewQuizData({ dryRun: true }) before the quiz-only migration, " +
        "or importNewGuideData({ dryRun: true }) before a full content migration."
    );
}(window));
