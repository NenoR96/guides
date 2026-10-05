(function (global) {
    "use strict";

    // Persisted releases use the legacy key "lessons" for guide records.
    const TAGS = {
        lessons: "guideLessons",
        quizzes: "guideQuizzes",
        journeys: "guideJourneys",
        legacyHtml: "interactiveGuideHtml",
        releaseState: "guideReleaseState",
        shells: "guideShellRevisions",
        contentRevisions: "guideContentRevisions"
    };
    const PAGE_SIZE = 50;
    const MAX_HTML_BYTES = 4 * 1024 * 1024;
    const state = { draft: null, activeReleaseId: null, releaseState: null, shells: [], initialized: false };
    const $ = (id) => document.getElementById(id);

    function setStatus(message, type) {
        const target = $("release-status") || $("html-status");
        if (!target) return;
        target.textContent = message || "";
        target.dataset.type = type || "";
    }

    function setPublishStatus(message, type) {
        const target = $("publish-status");
        if (!target) return setStatus(message, type);
        target.textContent = message || "";
        target.dataset.type = type || "";
    }

    function clone(value) {
        return value == null ? value : JSON.parse(JSON.stringify(value));
    }

    function errorMessage(error) {
        return error && (error.message || String(error)) || "Unknown error";
    }

    function getData(tag) {
        return new Promise((resolve, reject) => {
            buildfire.datastore.get(tag, (error, result) => {
                if (error) reject(error);
                else resolve(result && result.data ? result.data : null);
            });
        });
    }

    function saveData(data, tag) {
        return new Promise((resolve, reject) => {
            buildfire.datastore.save(data, tag, (error, result) => error ? reject(error) : resolve(result));
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

    async function searchRecords(tag) {
        const records = [];
        for (let page = 0; ; page += 1) {
            const batch = await searchPage(tag, page);
            records.push(...batch);
            if (batch.length < PAGE_SIZE) break;
        }
        return records;
    }

    function recordData(record) {
        return record && record.data ? record.data : record;
    }

    function recordId(record) {
        return record && (record.id || record._id || record.recordId) || null;
    }

    function insert(tag, data) {
        return new Promise((resolve, reject) => {
            buildfire.datastore.insert(data, tag, false, (error, result) => error ? reject(error) : resolve(result));
        });
    }

    function update(tag, id, data) {
        return new Promise((resolve, reject) => {
            buildfire.datastore.update(id, data, tag, (error, result) => error ? reject(error) : resolve(result));
        });
    }

    function deleteRecord(tag, id) {
        return new Promise((resolve, reject) => {
            buildfire.datastore.delete(id, tag, (error, result) => error ? reject(error) : resolve(result));
        });
    }

    function downloadText(contents, type, fileName) {
        const url = URL.createObjectURL(new Blob([contents], { type }));
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 0);
    }

    function contractVersion(documentNode) {
        const meta = documentNode.querySelector('meta[name="guides-shell-contract"]');
        return meta ? Number(meta.getAttribute("content")) || 0 : 0;
    }

    function parseJsonScript(documentNode, id, required) {
        const script = documentNode.getElementById(id);
        if (!script) {
            if (required) throw new Error("Missing #" + id + " JSON block.");
            return null;
        }
        try {
            return JSON.parse(script.textContent || "null");
        } catch (error) {
            throw new Error("#" + id + " must contain valid JSON.");
        }
    }

    function safeBodyHtml(html, label) {
        const template = document.createElement("template");
        template.innerHTML = String(html || "");
        if (template.content.querySelector("script")) throw new Error(label + " bodyHtml cannot contain scripts.");
        for (const element of template.content.querySelectorAll("*")) {
            for (const attribute of Array.from(element.attributes)) {
                const name = attribute.name.toLowerCase();
                const value = attribute.value.trim().toLowerCase();
                if (name.startsWith("on") || name === "srcdoc") element.removeAttribute(attribute.name);
                else if (["href", "src", "xlink:href"].includes(name) && value.startsWith("javascript:")) {
                    element.removeAttribute(attribute.name);
                }
            }
        }
        return template.innerHTML.trim();
    }

    function validateContentPayload(raw) {
        if (!raw) return null;
        const lessons = Array.isArray(raw) ? raw : raw.lessons;
        if (!Array.isArray(lessons)) throw new Error("#guides-content must contain a lessons array of guides.");
        const seen = new Set();
        const normalized = lessons.map((lesson, index) => {
            const label = "Guide " + (index + 1);
            if (!lesson || typeof lesson !== "object" || Array.isArray(lesson)) throw new Error(label + " must be an object.");
            const slug = String(lesson.slug || "").trim();
            if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error(label + " has an invalid stable ID: " + slug);
            if (seen.has(slug)) throw new Error("Duplicate stable guide ID: " + slug);
            seen.add(slug);
            if (!String(lesson.title || "").trim()) throw new Error(label + " is missing title.");
            if (typeof lesson.bodyHtml !== "string" || !lesson.bodyHtml.trim()) throw new Error(label + " is missing bodyHtml.");
            const bodyHtml = safeBodyHtml(lesson.bodyHtml, label);
            if (lesson.tldr != null && (!Array.isArray(lesson.tldr) || lesson.tldr.some((item) => typeof item !== "string"))) {
                throw new Error(label + " tldr must be an array of strings.");
            }
            return { ...clone(lesson), schemaVersion: Number(lesson.schemaVersion) || 1, slug, title: lesson.title.trim(), bodyHtml };
        });
        const quizIds = new Set();
        const quizzes = (raw.quizzes || []).map((quiz, index) => {
            const label = "Quiz " + (index + 1);
            if (!quiz || typeof quiz !== "object" || Array.isArray(quiz)) throw new Error(label + " must be an object.");
            const id = String(quiz.id || "").trim();
            if (!/^[a-zA-Z0-9._-]{1,120}$/.test(id)) throw new Error(label + " has an invalid stable ID: " + id);
            if (quizIds.has(id)) throw new Error("Duplicate stable quiz ID: " + id);
            quizIds.add(id);
            if (!String(quiz.title || "").trim()) throw new Error(label + " is missing title.");
            const questions = Array.isArray(quiz.questions) ? quiz.questions : [];
            if (!questions.length) throw new Error(label + " must contain questions.");
            const validateQuestion = (question, questionLabel) => {
                if (!question || typeof question !== "object" || Array.isArray(question)) throw new Error(questionLabel + " must be an object.");
                if (!Array.isArray(question.options) || question.options.length < 2) throw new Error(questionLabel + " needs at least two options.");
                if (!Number.isInteger(question.correct) || question.correct < 0 || question.correct >= question.options.length) {
                    throw new Error(questionLabel + " has an invalid correct answer index.");
                }
                ["text", "scene", "why", "did", "belong"].forEach((key) => {
                    if (typeof question[key] === "string") question[key] = safeBodyHtml(question[key], questionLabel);
                });
                question.options = question.options.map((option) =>
                    typeof option === "string" ? safeBodyHtml(option, questionLabel) : option
                );
            };
            questions.forEach((question, questionIndex) => validateQuestion(question, label + " question " + (questionIndex + 1)));
            if (quiz.bonus != null) validateQuestion(quiz.bonus, label + " bonus question");
            if (!Array.isArray(quiz.results) || !quiz.results.length) throw new Error(label + " must contain result tiers.");
            return {
                ...clone(quiz), schemaVersion: Number(quiz.schemaVersion) || 1, id,
                title: quiz.title.trim(), questionCount: questions.length
            };
        });
        const journeyData = raw.journeyData || (Array.isArray(raw.journeys) ? {
            schemaVersion: Number(raw.schemaVersion) || 1,
            defaultJourneyId: raw.defaultJourneyId || "",
            journeys: raw.journeys
        } : null);
        if (journeyData && !Array.isArray(journeyData.journeys)) throw new Error("journeyData.journeys must be an array.");
        const archivedLessonIds = raw.archivedLessonIds == null ? [] : raw.archivedLessonIds;
        if (!Array.isArray(archivedLessonIds) || archivedLessonIds.some((id) => typeof id !== "string")) {
            throw new Error("archivedLessonIds must be an array of stable guide IDs.");
        }
        const overlap = archivedLessonIds.find((id) => seen.has(id));
        if (overlap) throw new Error("A guide cannot be updated and archived in the same release: " + overlap);
        const archivedQuizIds = raw.archivedQuizIds == null ? [] : raw.archivedQuizIds;
        if (!Array.isArray(archivedQuizIds) || archivedQuizIds.some((id) => typeof id !== "string")) {
            throw new Error("archivedQuizIds must be an array of stable quiz IDs.");
        }
        const quizOverlap = archivedQuizIds.find((id) => quizIds.has(id));
        if (quizOverlap) throw new Error("A quiz cannot be updated and archived in the same release: " + quizOverlap);
        return {
            schemaVersion: Number(raw.schemaVersion) || 1,
            lessons: normalized,
            quizzes,
            journeyData: journeyData ? clone(journeyData) : null,
            archivedLessonIds: archivedLessonIds.slice(),
            archivedQuizIds: archivedQuizIds.slice()
        };
    }

    function validateHtml(html) {
        if (new Blob([html]).size > MAX_HTML_BYTES) throw new Error("HTML exceeds the 4 MB release limit.");
        const documentNode = new DOMParser().parseFromString(html, "text/html");
        if (!documentNode.documentElement || !documentNode.body) throw new Error("The file is not a complete HTML document.");
        const contract = contractVersion(documentNode);
        if (contract > 1) throw new Error("This plugin supports shell contract version 1, not version " + contract + ".");
        const content = validateContentPayload(parseJsonScript(documentNode, "guides-content", false));
        const manifest = parseJsonScript(documentNode, "guides-release-manifest", false) || {};
        const warnings = [];
        if (!contract) warnings.push("Legacy shell: it can be versioned, but it still owns BuildFire behavior and does not receive protected runtime data through GuidesAPI.");
        const executableSource = Array.from(documentNode.scripts)
            .filter((script) => !["guides-content", "guides-release-manifest", "guides-working-preview-bootstrap"].includes(script.id))
            .map((script) => script.textContent || script.getAttribute("src") || "")
            .join("\n");
        if (contract && /buildfire\s*\.\s*(datastore|userData)/i.test(executableSource)) {
            throw new Error("Contract shells cannot access buildfire.datastore or buildfire.userData directly. Use GuidesAPI.");
        }
        if (!content) warnings.push("Design-only release: current datastore content will be preserved unchanged.");
        if (contract && documentNode.querySelector("script[src]")) {
            throw new Error("Contract shells must be self-contained and cannot load external scripts.");
        }
        if (!contract && documentNode.querySelector('script[src^="http://"],script[src^="https://"]')) {
            warnings.push("The legacy shell loads external scripts. Confirm that every dependency is approved and stable.");
        }
        return { contract, content, manifest, warnings };
    }

    async function currentSnapshot() {
        const [lessonRecords, quizRecords, journeyData] = await Promise.all([
            searchRecords(TAGS.lessons), searchRecords(TAGS.quizzes), getData(TAGS.journeys)
        ]);
        return {
            lessonRecords,
            lessons: lessonRecords.map(recordData).filter((lesson) => lesson && lesson.slug),
            quizRecords,
            quizzes: quizRecords.map(recordData).filter((quiz) => quiz && quiz.id),
            journeyData: journeyData || { schemaVersion: 1, defaultJourneyId: "", journeys: [] }
        };
    }

    function contentDiff(payload, snapshot) {
        if (!payload) return { creates: [], updates: [], unchanged: [], archives: [], quizCreates: [], quizUpdates: [], quizUnchanged: [], quizArchives: [] };
        const current = new Map(snapshot.lessons.map((lesson) => [lesson.slug, lesson]));
        const creates = [];
        const updates = [];
        const unchanged = [];
        payload.lessons.forEach((lesson) => {
            const existing = current.get(lesson.slug);
            if (!existing) creates.push(lesson.slug);
            else {
                const cleanExisting = { ...existing };
                delete cleanExisting._recordId;
                delete cleanExisting.summary;
                JSON.stringify(cleanExisting) === JSON.stringify(lesson) ? unchanged.push(lesson.slug) : updates.push(lesson.slug);
            }
        });
        const archives = payload.archivedLessonIds.filter((id) => current.has(id));
        const currentQuizzes = new Map(snapshot.quizzes.map((quiz) => [quiz.id, quiz]));
        const quizCreates = []; const quizUpdates = []; const quizUnchanged = [];
        payload.quizzes.forEach((quiz) => {
            const existing = currentQuizzes.get(quiz.id);
            if (!existing) quizCreates.push(quiz.id);
            else {
                const cleanExisting = { ...existing }; delete cleanExisting._recordId;
                JSON.stringify(cleanExisting) === JSON.stringify(quiz) ? quizUnchanged.push(quiz.id) : quizUpdates.push(quiz.id);
            }
        });
        const quizArchives = payload.archivedQuizIds.filter((id) => currentQuizzes.has(id));
        return { creates, updates, unchanged, archives, quizCreates, quizUpdates, quizUnchanged, quizArchives };
    }

    function targetSnapshot(payload, before) {
        if (!payload) return { lessons: clone(before.lessons), quizzes: clone(before.quizzes), journeyData: clone(before.journeyData) };
        const bySlug = new Map(before.lessons.map((lesson) => [lesson.slug, clone(lesson)]));
        payload.lessons.forEach((lesson) => bySlug.set(lesson.slug, clone(lesson)));
        payload.archivedLessonIds.forEach((slug) => {
            const lesson = bySlug.get(slug);
            if (lesson) bySlug.set(slug, { ...lesson, published: false, archivedAt: new Date().toISOString() });
        });
        const quizzesById = new Map(before.quizzes.map((quiz) => [quiz.id, clone(quiz)]));
        payload.quizzes.forEach((quiz) => quizzesById.set(quiz.id, clone(quiz)));
        payload.archivedQuizIds.forEach((id) => {
            const quiz = quizzesById.get(id);
            if (quiz) quizzesById.set(id, { ...quiz, published: false, archivedAt: new Date().toISOString() });
        });
        return {
            lessons: Array.from(bySlug.values()).map((lesson) => {
                const clean = { ...lesson };
                delete clean._recordId;
                delete clean.summary;
                return clean;
            }),
            quizzes: Array.from(quizzesById.values()).map((quiz) => {
                const clean = { ...quiz }; delete clean._recordId; return clean;
            }),
            journeyData: clone(payload.journeyData || before.journeyData)
        };
    }

    function selectedContentPayload(draft) {
        const content = draft && draft.validation && draft.validation.content;
        if (!content) return null;
        const options = draft.options || {};
        return {
            schemaVersion: content.schemaVersion,
            lessons: options.updateGuides ? content.lessons : [],
            quizzes: options.updateQuizzes ? content.quizzes : [],
            journeyData: options.updateGuides ? content.journeyData : null,
            archivedLessonIds: options.updateGuides ? content.archivedLessonIds : [],
            archivedQuizIds: options.updateQuizzes ? content.archivedQuizIds : []
        };
    }

    function refreshDraftSelection(draft, before) {
        const snapshot = before || draft.before;
        const payload = selectedContentPayload(draft);
        draft.before = snapshot;
        draft.target = targetSnapshot(payload, snapshot);
        draft.diff = contentDiff(payload, snapshot);
        draft.selectionError = null;
        try {
            validateTargetSnapshot(draft.target);
        } catch (error) {
            // Keep the user's checkbox choice visible. Some releases require
            // guides and quizzes together, so the first click can be an invalid
            // intermediate state until the second option is selected.
            draft.selectionError = errorMessage(error);
        }
        return !draft.selectionError;
    }

    function validateTargetSnapshot(snapshot) {
        const publishedIds = new Set(snapshot.lessons.filter((lesson) => lesson.published !== false).map((lesson) => lesson.slug));
        const quizIds = new Set();
        (snapshot.quizzes || []).filter((quiz) => quiz.published !== false).forEach((quiz) => {
            if (quizIds.has(quiz.id)) throw new Error("Duplicate quiz ID: " + quiz.id);
            quizIds.add(quiz.id);
            [quiz.afterGuideId, quiz.sourceGuideId, ...(quiz.alsoAfterGuideIds || [])].filter(Boolean).forEach((lessonId) => {
                if (!publishedIds.has(lessonId)) throw new Error("Quiz " + quiz.id + " references a missing or archived guide: " + lessonId);
            });
        });
        const journeys = snapshot.journeyData && snapshot.journeyData.journeys || [];
        const journeyIds = new Set();
        journeys.forEach((journey, journeyIndex) => {
            const label = "Journey " + (journeyIndex + 1);
            const id = String(journey && journey.id || "").trim();
            if (!id) throw new Error(label + " is missing a stable ID.");
            if (journeyIds.has(id)) throw new Error("Duplicate journey ID: " + id);
            journeyIds.add(id);
            const checkReferences = (ids, location) => {
                if (!Array.isArray(ids)) throw new Error(label + " " + location + " must be an array.");
                const missing = ids.find((lessonId) => !publishedIds.has(lessonId));
                if (missing) throw new Error(label + " " + location + " references a missing or archived guide: " + missing);
            };
            (journey.sections || []).forEach((section) => checkReferences(section.lessonIds || [], "section “" + (section.title || section.id || "untitled") + "”"));
            (journey.listThemes || []).forEach((theme) => checkReferences(theme.lessonIds || theme.guides || [], "category “" + (theme.label || theme.key || "untitled") + "”"));
            Object.entries(journey.phaseHighlights || {}).forEach(([age, ids]) => checkReferences(ids, "age " + age));
        });
        const defaultId = snapshot.journeyData && snapshot.journeyData.defaultJourneyId;
        if (defaultId && !journeyIds.has(defaultId)) throw new Error("The default journey ID does not exist: " + defaultId);
    }

    function previewBootstrap(data) {
        const json = JSON.stringify(data).replace(/</g, "\\u003c");
        return `<script>(function(){var data=${json};var listeners=[];window.GuidesAPI={version:1,getInitialData:function(){return Promise.resolve(data);},setGuideCompleted:function(slug,completed){var ids=new Set(data.progress.readGuideIds||[]);completed===false?ids.delete(slug):ids.add(slug);data.progress.readGuideIds=Array.from(ids);listeners.forEach(function(fn){fn(data);});return Promise.resolve(data.progress);},setQuizCompleted:function(id,completed){var ids=new Set(data.progress.completedQuizIds||[]);completed===false?ids.delete(id):ids.add(id);data.progress.completedQuizIds=Array.from(ids);return Promise.resolve(data.progress);},setBirthdate:function(value){data.profile.babyBirthdate=value||null;return Promise.resolve(data.profile);},savePreference:function(key,value){data.preferences[key]=value;return Promise.resolve(data.preferences);},setReaderMode:function(){return Promise.resolve();},goBack:function(){return Promise.resolve();},openUrl:function(url){console.log('Preview link',url);return Promise.resolve();},openActionItem:function(action){console.log('Preview action item',action);return Promise.resolve();},openPaywall:function(){return Promise.resolve();},subscribe:function(fn){listeners.push(fn);},onBack:function(){},onDeepLink:function(){}};window.__GUIDES_INITIAL_DATA__=data;}());<\/script>`;
    }

    function injectAfterHead(html, addition) {
        return /<head\b[^>]*>/i.test(html) ? html.replace(/<head\b[^>]*>/i, (head) => head + addition) : addition + html;
    }

    function renderDraft() {
        const panel = $("release-draft-panel");
        if (!state.draft) {
            panel.classList.remove("visible");
            $("release-preview").removeAttribute("srcdoc");
            setPublishStatus("", "");
            return;
        }
        const diff = state.draft.diff;
        const hasContent = !!state.draft.validation.content;
        const updateGuides = hasContent && state.draft.options.updateGuides;
        const updateQuizzes = hasContent && state.draft.options.updateQuizzes;
        $("release-update-guides").disabled = !hasContent;
        $("release-update-quizzes").disabled = !hasContent;
        $("release-update-guides").checked = !!updateGuides;
        $("release-update-quizzes").checked = !!updateQuizzes;
        $("release-diff").innerHTML = '<strong>' + state.draft.fileName + '</strong><br>' +
            'Contract v' + state.draft.validation.contract + ' · ' +
            (updateGuides
                ? diff.creates.length + ' new guides · ' + diff.updates.length + ' updated · ' +
                    diff.archives.length + ' archived · ' + diff.unchanged.length + ' unchanged' +
                    (state.draft.validation.content.journeyData ? ' · organization included' : ' · organization unchanged')
                : 'guides and organization preserved from live datastore');
        $("release-diff").innerHTML += '<br>' + (updateQuizzes
            ? diff.quizCreates.length + ' new quiz(zes) / ' + diff.quizUpdates.length + ' updated / ' +
                diff.quizArchives.length + ' archived / ' + diff.quizUnchanged.length + ' unchanged'
            : 'quizzes preserved from live datastore');
        const warnings = $("release-warnings");
        warnings.innerHTML = "";
        const draftWarnings = state.draft.validation.warnings.slice();
        if (state.draft.selectionError) draftWarnings.push("Content selection: " + state.draft.selectionError);
        draftWarnings.forEach((warning) => {
            const item = document.createElement("li");
            item.textContent = warning;
            warnings.appendChild(item);
        });
        warnings.hidden = !draftWarnings.length;
        $("publish-release").disabled = !!state.draft.selectionError;
        const target = state.draft.target;
        const journeys = target.journeyData && target.journeyData.journeys || [];
        const activeJourney = journeys.find((journey) => journey.id === target.journeyData.defaultJourneyId) || journeys[0] || null;
        const previewData = {
            runtime: { version: 1, shellContractVersion: 1, preview: true },
            lessons: target.lessons.filter((lesson) => lesson.published !== false),
            quizzes: (target.quizzes || []).filter((quiz) => quiz.published !== false),
            journeyData: target.journeyData,
            activeJourney,
            // An empty preview progress set prevents the shell's "continue"
            // anchor from scrolling the surrounding Content panel on reload.
            progress: { readGuideIds: [], completedQuizIds: [] },
            profile: { babyBirthdate: "2025-12-10" },
            preferences: {},
            currentUser: { id: "preview-user", displayName: "Preview User", firstName: "Preview" },
            entitlements: { hasSubscriptions: true, subscriptions: [] }
        };
        $("release-preview").srcdoc = injectAfterHead(state.draft.html, previewBootstrap(previewData));
        panel.classList.add("visible");
    }

    async function stageFile(file) {
        if (!/\.html?$/i.test(file.name) && file.type !== "text/html" && file.type !== "") {
            setStatus("Please choose an .html or .htm file.", "error");
            return;
        }
        try {
            setStatus("Reading and validating " + file.name + "…", "loading");
            const html = await file.text();
            if (!html.trim()) throw new Error("The selected HTML file is empty.");
            const validation = validateHtml(html);
            const before = await currentSnapshot();
            state.draft = {
                html,
                fileName: file.name,
                fileSize: file.size,
                validation,
                before,
                options: { updateGuides: false, updateQuizzes: false },
                diff: null,
                target: null
            };
            refreshDraftSelection(state.draft);
            setPublishStatus("", "");
            renderDraft();
            setStatus("Release staged as design-only. Choose explicitly if this upload should update guides or quizzes.", "success");
        } catch (error) {
            state.draft = null;
            renderDraft();
            setStatus("Unable to stage release: " + errorMessage(error), "error");
        } finally {
            const input = $("html-file");
            if (input) input.value = "";
        }
    }

    async function applySnapshot(snapshot, options) {
        const updateGuides = !options || options.updateGuides === true;
        const updateQuizzes = !options || options.updateQuizzes === true;
        if (updateGuides) {
            const records = await searchRecords(TAGS.lessons);
            const current = new Map(records
                .filter((record) => recordData(record) && recordData(record).slug)
                .map((record) => [recordData(record).slug, record]));
            const target = new Map(snapshot.lessons.map((lesson) => [lesson.slug, lesson]));
            for (const lesson of snapshot.lessons) {
                const existing = current.get(lesson.slug);
                if (existing && recordId(existing)) await update(TAGS.lessons, recordId(existing), clone(lesson));
                else await insert(TAGS.lessons, clone(lesson));
            }
            for (const [slug, record] of current) {
                if (target.has(slug) || !recordId(record)) continue;
                await update(TAGS.lessons, recordId(record), {
                    ...clone(recordData(record)),
                    published: false,
                    archivedAt: new Date().toISOString()
                });
            }
            await saveData({ ...clone(snapshot.journeyData), updatedAt: new Date().toISOString() }, TAGS.journeys);
            if (global.GuidesDeepLinks && typeof global.GuidesDeepLinks.syncGuides === "function") {
                await global.GuidesDeepLinks.syncGuides(snapshot.lessons);
                for (const [slug] of current) {
                    if (!target.has(slug)) await global.GuidesDeepLinks.unregisterGuide(slug);
                }
            }
        }
        // Revisions created before quiz snapshots existed intentionally leave
        // current quizzes untouched when restored.
        if (updateQuizzes && Array.isArray(snapshot.quizzes)) {
            const quizRecords = await searchRecords(TAGS.quizzes);
            const currentQuizzes = new Map(quizRecords
                .filter((record) => recordData(record) && recordData(record).id)
                .map((record) => [recordData(record).id, record]));
            const targetQuizzes = new Map(snapshot.quizzes.map((quiz) => [quiz.id, quiz]));
            for (const quiz of snapshot.quizzes) {
                const existing = currentQuizzes.get(quiz.id);
                if (existing && recordId(existing)) await update(TAGS.quizzes, recordId(existing), clone(quiz));
                else await insert(TAGS.quizzes, clone(quiz));
            }
            for (const [quizId, record] of currentQuizzes) {
                if (targetQuizzes.has(quizId) || !recordId(record)) continue;
                await update(TAGS.quizzes, recordId(record), {
                    ...clone(recordData(record)), published: false, archivedAt: new Date().toISOString()
                });
            }
        }
        if (!global.GuidesCatalogSync || typeof global.GuidesCatalogSync.syncFromDatastore !== "function") {
            throw new Error("Home catalog synchronization is unavailable.");
        }
        await global.GuidesCatalogSync.syncFromDatastore();
    }

    function releaseId() {
        return "release-" + new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14) + "-" + Math.random().toString(36).slice(2, 7);
    }

    let publishConfirmationTimer = null;

    function resetPublishConfirmation() {
        const button = $("publish-release");
        if (!button) return;
        delete button.dataset.confirmPublish;
        button.textContent = "Publish release";
        if (publishConfirmationTimer) clearTimeout(publishConfirmationTimer);
        publishConfirmationTimer = null;
    }

    function confirmPublishInPage() {
        const button = $("publish-release");
        if (button.dataset.confirmPublish === "true") {
            resetPublishConfirmation();
            return true;
        }
        button.dataset.confirmPublish = "true";
        button.textContent = "Click again to publish";
        const choices = [];
        if (state.draft && state.draft.options.updateGuides) choices.push("guides and organization");
        if (state.draft && state.draft.options.updateQuizzes) choices.push("quizzes");
        setPublishStatus("Publishing " + (choices.length ? "the shell plus " + choices.join(" and ") : "the shell only") + ". Click Publish again within 8 seconds to confirm.", "warning");
        publishConfirmationTimer = setTimeout(() => {
            resetPublishConfirmation();
            setPublishStatus("", "");
        }, 8000);
        return false;
    }

    async function publishDraft() {
        if (!state.draft) return;
        if (state.draft.selectionError) {
            setPublishStatus("Resolve the content selection warning before publishing: " + state.draft.selectionError, "error");
            return;
        }
        if (!confirmPublishInPage()) return;
        const draft = state.draft;
        const id = releaseId();
        const now = new Date().toISOString();
        try {
            $("publish-release").disabled = true;
            // Re-read live content at the last possible moment. Any content type
            // not explicitly selected remains exactly as the team most recently
            // saved it, even if it changed after this HTML was staged.
            const liveBeforePublish = await currentSnapshot();
            refreshDraftSelection(draft, liveBeforePublish);
            if (draft.selectionError) throw new Error(draft.selectionError);
            if (!global.GuidesDeepLinks || typeof global.GuidesDeepLinks.syncAll !== "function") {
                throw new Error("Guide and quiz deep-link registration is unavailable.");
            }
            setPublishStatus("Saving release snapshot…", "loading");
            await insert(TAGS.contentRevisions, {
                schemaVersion: 1,
                releaseId: id,
                createdAt: now,
                contentUpdate: clone(draft.options),
                content: clone(draft.target)
            });
            await insert(TAGS.shells, {
                schemaVersion: 1,
                releaseId: id,
                contractVersion: draft.validation.contract,
                contentSchemaVersion: draft.validation.content && draft.validation.content.schemaVersion || 1,
                fileName: draft.fileName,
                fileSize: draft.fileSize,
                description: draft.validation.manifest.description || "",
                contentUpdate: clone(draft.options),
                publishedAt: now,
                html: draft.html
            });
            setPublishStatus("Applying content changes…", "loading");
            await applySnapshot(draft.target, draft.options);
            setPublishStatus("Registering guide and quiz deep links…", "loading");
            await global.GuidesDeepLinks.syncAll(draft.target.lessons, draft.target.quizzes);
            await saveData({
                schemaVersion: 1,
                activeReleaseId: id,
                previousReleaseId: state.activeReleaseId || null,
                publishedAt: now
            }, TAGS.releaseState);
            state.activeReleaseId = id;
            state.draft = null;
            renderDraft();
            await loadHistory();
            setStatus("Release published. Unselected live guides or quizzes were preserved.", "success");
            if (typeof buildfire !== "undefined" && buildfire.messaging && typeof buildfire.messaging.sendMessageToWidget === "function") {
                buildfire.messaging.sendMessageToWidget({ type: "guides-release-published", releaseId: id });
            }
        } catch (error) {
            console.error("Unable to publish guide release", error);
            try {
                await applySnapshot({ lessons: draft.before.lessons, quizzes: draft.before.quizzes, journeyData: draft.before.journeyData }, draft.options);
                setPublishStatus("Publish failed and content was restored: " + errorMessage(error), "error");
            } catch (restoreError) {
                console.error("Unable to restore content after failed release", restoreError);
                setPublishStatus("Publish failed and automatic restoration also failed. Export content before retrying. " + errorMessage(error), "error");
            }
        } finally {
            $("publish-release").disabled = !!(state.draft && state.draft.selectionError);
            resetPublishConfirmation();
        }
    }

    async function findContentRevision(id) {
        const revisions = await searchRecords(TAGS.contentRevisions);
        const record = revisions.find((item) => recordData(item).releaseId === id);
        return record ? recordData(record) : null;
    }

    async function restoreRelease(id, button) {
        const shell = state.shells.find((item) => item.releaseId === id);
        if (!shell || id === state.activeReleaseId) return;
        if (!button || button.dataset.confirmRestore !== "true") {
            if (button) {
                button.dataset.confirmRestore = "true";
                button.textContent = "Click again to restore";
                setTimeout(() => {
                    if (!button.isConnected) return;
                    delete button.dataset.confirmRestore;
                    button.textContent = "Restore";
                }, 8000);
            }
            setStatus("Click Restore again within 8 seconds to confirm. User progress will not change.", "warning");
            return;
        }
        delete button.dataset.confirmRestore;
        button.disabled = true;
        try {
            setStatus("Restoring release…", "loading");
            const contentRevision = await findContentRevision(id);
            if (!contentRevision || !contentRevision.content) throw new Error("The release content snapshot is missing.");
            const before = await currentSnapshot();
            try {
                await applySnapshot(contentRevision.content);
                await saveData({
                    schemaVersion: 1,
                    activeReleaseId: id,
                    previousReleaseId: state.activeReleaseId || null,
                    publishedAt: new Date().toISOString(),
                    restored: true
                }, TAGS.releaseState);
            } catch (error) {
                await applySnapshot({ lessons: before.lessons, quizzes: before.quizzes, journeyData: before.journeyData });
                throw error;
            }
            state.activeReleaseId = id;
            await loadHistory();
            setStatus("Release restored. User progress was preserved.", "success");
        } catch (error) {
            setStatus("Unable to restore release: " + errorMessage(error), "error");
        }
    }

    async function deleteReleaseRecords(releaseIds) {
        const ids = new Set(releaseIds);
        if (ids.has(state.activeReleaseId)) throw new Error("The current release cannot be deleted.");
        const [shellRecords, contentRecords] = await Promise.all([
            searchRecords(TAGS.shells),
            searchRecords(TAGS.contentRevisions)
        ]);
        const targets = [
            ...shellRecords
                .filter((record) => ids.has(recordData(record) && recordData(record).releaseId))
                .map((record) => ({ tag: TAGS.shells, id: recordId(record) })),
            ...contentRecords
                .filter((record) => ids.has(recordData(record) && recordData(record).releaseId))
                .map((record) => ({ tag: TAGS.contentRevisions, id: recordId(record) }))
        ].filter((target) => target.id);
        for (const target of targets) await deleteRecord(target.tag, target.id);

        if (state.releaseState && ids.has(state.releaseState.previousReleaseId)) {
            state.releaseState = { ...state.releaseState, previousReleaseId: null };
            await saveData(state.releaseState, TAGS.releaseState);
        }
        return targets.length;
    }

    async function deleteRelease(id, button) {
        if (!id || id === state.activeReleaseId) return;
        if (!button || button.dataset.confirmDelete !== "true") {
            if (button) {
                button.dataset.confirmDelete = "true";
                button.textContent = "Click again to delete";
                setTimeout(() => {
                    if (!button.isConnected) return;
                    delete button.dataset.confirmDelete;
                    button.textContent = "Delete";
                }, 8000);
            }
            setStatus("Click Delete again within 8 seconds to permanently remove this release shell and content snapshot.", "warning");
            return;
        }
        delete button.dataset.confirmDelete;
        button.disabled = true;
        try {
            setStatus("Deleting release history…", "loading");
            const deleted = await deleteReleaseRecords([id]);
            await loadHistory();
            setStatus("Release deleted (" + deleted + " stored revision record" + (deleted === 1 ? "" : "s") + ").", "success");
        } catch (error) {
            button.disabled = false;
            button.textContent = "Delete";
            setStatus("Unable to delete release: " + errorMessage(error), "error");
        }
    }

    let deleteInactiveTimer = null;

    function resetDeleteInactiveConfirmation() {
        const button = $("delete-inactive-releases");
        if (!button) return;
        delete button.dataset.confirmDelete;
        button.textContent = "Delete inactive releases";
        if (deleteInactiveTimer) clearTimeout(deleteInactiveTimer);
        deleteInactiveTimer = null;
    }

    async function deleteInactiveReleases() {
        const button = $("delete-inactive-releases");
        const ids = state.shells
            .map((release) => release.releaseId)
            .filter((id) => id && id !== state.activeReleaseId);
        if (!ids.length) {
            setStatus("There are no inactive releases to delete.", "");
            return;
        }
        if (button.dataset.confirmDelete !== "true") {
            button.dataset.confirmDelete = "true";
            button.textContent = "Click again to delete " + ids.length;
            setStatus("Click again within 8 seconds to permanently delete " + ids.length + " inactive release" + (ids.length === 1 ? "" : "s") + ". The current release will be kept.", "warning");
            deleteInactiveTimer = setTimeout(resetDeleteInactiveConfirmation, 8000);
            return;
        }
        resetDeleteInactiveConfirmation();
        button.disabled = true;
        try {
            setStatus("Deleting inactive release history…", "loading");
            const deleted = await deleteReleaseRecords(ids);
            await loadHistory();
            setStatus("Deleted " + ids.length + " inactive release" + (ids.length === 1 ? "" : "s") + " and " + deleted + " stored revision records.", "success");
        } catch (error) {
            setStatus("Unable to delete inactive releases: " + errorMessage(error), "error");
        } finally {
            button.disabled = false;
            resetDeleteInactiveConfirmation();
        }
    }

    function renderHistory() {
        const target = $("release-list");
        target.innerHTML = "";
        const releases = state.shells.slice().sort((a, b) => String(b.publishedAt || "").localeCompare(String(a.publishedAt || "")));
        if (!releases.length) {
            target.innerHTML = '<div class="list-empty">No versioned releases yet. The existing legacy shell remains available.</div>';
            return;
        }
        releases.forEach((release) => {
            const row = document.createElement("div");
            row.className = "release-item";
            const copy = document.createElement("div");
            copy.className = "release-item-copy";
            const title = document.createElement("strong");
            title.textContent = release.fileName || release.releaseId;
            const meta = document.createElement("span");
            const date = release.publishedAt ? new Date(release.publishedAt).toLocaleString() : "Unknown date";
            meta.textContent = date + " · contract v" + (release.contractVersion || 0);
            if (release.releaseId === state.activeReleaseId) {
                meta.textContent += " · Current";
                meta.className = "release-current";
            }
            copy.append(title, meta);
            row.appendChild(copy);
            if (release.releaseId !== state.activeReleaseId) {
                const actions = document.createElement("div");
                actions.className = "release-item-actions";
                const restoreButton = document.createElement("button");
                restoreButton.type = "button";
                restoreButton.className = "btn small";
                restoreButton.textContent = "Restore";
                restoreButton.addEventListener("click", () => restoreRelease(release.releaseId, restoreButton));
                const deleteButton = document.createElement("button");
                deleteButton.type = "button";
                deleteButton.className = "btn small danger";
                deleteButton.textContent = "Delete";
                deleteButton.addEventListener("click", () => deleteRelease(release.releaseId, deleteButton));
                actions.append(restoreButton, deleteButton);
                row.appendChild(actions);
            }
            target.appendChild(row);
        });
    }

    async function loadHistory() {
        const [releaseState, shellRecords] = await Promise.all([getData(TAGS.releaseState), searchRecords(TAGS.shells)]);
        state.releaseState = releaseState || null;
        state.activeReleaseId = releaseState && releaseState.activeReleaseId || null;
        state.shells = shellRecords.map(recordData).filter((item) => item && item.releaseId);
        const active = state.shells.find((item) => item.releaseId === state.activeReleaseId);
        if (active) {
            $("download-html").disabled = false;
            $("html-upload-meta").classList.add("visible");
            $("html-upload-name").textContent = active.fileName || active.releaseId;
            $("html-upload-details").textContent = "Current versioned release · " +
                (active.publishedAt ? new Date(active.publishedAt).toLocaleString() : "unknown date");
            $("html-file-prompt").textContent = "Choose an AI working .html file to stage a new release";
        }
        renderHistory();
    }

    async function downloadActiveShell() {
        try {
            const active = state.shells.find((item) => item.releaseId === state.activeReleaseId);
            if (active && active.html) {
                downloadText(active.html, "text/html;charset=utf-8", active.fileName || "interactive-guides.html");
                setStatus("Current release shell downloaded.", "success");
                return;
            }
            const legacy = await getData(TAGS.legacyHtml);
            if (!legacy || !legacy.html) throw new Error("No HTML shell is available.");
            downloadText(legacy.html, "text/html;charset=utf-8", legacy.fileName || "interactive-guides.html");
            setStatus("Legacy shell downloaded.", "success");
        } catch (error) {
            setStatus("Unable to download shell: " + errorMessage(error), "error");
        }
    }

    function starterShell() {
        return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="guides-shell-contract" content="1">
  <title>Guias</title>
  <style>
    *{box-sizing:border-box}body{margin:0;background:#f7f7f5;color:#27313d;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.app{max-width:760px;margin:auto;padding:24px}.hero{padding:24px;border-radius:18px;color:#fff;background:#14577c}.list{display:grid;gap:10px;margin-top:18px}.guide{width:100%;padding:16px;border:1px solid #e1e5e9;border-radius:12px;background:#fff;text-align:left}.guide.done{border-color:#1abc9c}.reader{padding:24px;background:#fff}.reader img{max-width:100%}button{font:inherit;cursor:pointer}.back{margin-bottom:18px}
  </style>
</head>
<body><main id="app" class="app">Loading…</main>
<script>
(async function(){
  const data=await GuidesAPI.getInitialData();
  const root=document.getElementById('app');
  const completed=new Set(data.progress.readGuideIds||[]);
  function home(){
    const journey=data.activeJourney||{};
    root.innerHTML='<section class="hero"><small>Sua jornada</small><h1>'+escape(journey.title||'Guias')+'</h1><p>'+escape(journey.description||'')+'</p></section><section class="list">'+data.lessons.map(function(g){return '<button class="guide '+(completed.has(g.slug)?'done':'')+'" data-id="'+escape(g.slug)+'"><strong>'+escape(g.title)+'</strong><br><small>'+escape(g.readTime||'')+'</small></button>';}).join('')+'</section>';
    root.querySelectorAll('[data-id]').forEach(function(button){button.onclick=function(){reader(button.dataset.id);};});
  }
  function reader(id){const guide=data.lessons.find(function(item){return item.slug===id;});if(!guide)return home();root.innerHTML='<article class="reader"><button class="back">← Voltar</button><h1>'+escape(guide.title)+'</h1><div>'+guide.bodyHtml+'</div><button id="complete">'+(completed.has(id)?'✓ Concluído':'Marcar como concluído')+'</button></article>';root.querySelector('.back').onclick=home;root.querySelector('#complete').onclick=async function(){completed.has(id)?completed.delete(id):completed.add(id);await GuidesAPI.setGuideCompleted(id,completed.has(id));reader(id);};}
  function escape(value){return String(value==null?'':value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  home();
}());
<\/script></body></html>`;
    }

    function removeWorkingBlocks(html) {
        return html
            .replace(/<script\b[^>]*id=["']guides-release-manifest["'][^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<script\b[^>]*id=["']guides-content["'][^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<script\b[^>]*id=["']guides-working-preview-bootstrap["'][^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<!--\s*GUIDES AI WORKING FILE[\s\S]*?END GUIDES AI INSTRUCTIONS\s*-->/gi, "");
    }

    function addWorkingBlocks(html, content) {
        const instructions = `<!-- GUIDES AI WORKING FILE
This file contains real design and content context. You may edit both.
Rules:
1. Preserve <meta name="guides-shell-contract" content="1">. If this legacy file does not have it, add it and replace direct BuildFire persistence calls with GuidesAPI before publishing.
2. In contract mode, use GuidesAPI.getInitialData(), setGuideCompleted(), setQuizCompleted(), setBirthdate(), savePreference(), goBack(), openUrl(), openActionItem(), and openPaywall().
3. Never call buildfire.datastore or buildfire.userData from this file.
4. Guide records remain under the compatibility key lessons. Never change an existing guide's lesson.slug or a quiz.id merely because its title changes.
5. Edit #guides-content for content changes. Omitted guides in lessons and omitted quizzes are preserved; archive only through archivedLessonIds or archivedQuizIds.
6. The embedded content is for AI context and direct-file preview. Production injects canonical datastore content.
7. A new guide in lessons[] requires schemaVersion, a unique permanent lowercase-hyphenated slug, title, bodyHtml, published, premium, icon, readTime, tag, tldr, phaseKeys, listThemeKey, and journeySectionKey. Keep bodyHtml limited to guide-body markup; never place html, head, body, or script elements inside it.
8. Organization is canonical in journeyData. For every new published guide, edit the supplied default journey in place and add its slug exactly once to one sections[].lessonIds array and exactly once to one listThemes[].lessonIds array. Array position controls display order. Add it to each relevant phaseHighlights age array; supported age keys are 5, 6, 7, 8, 9, 10, 11, 12, and 24. A guide may belong to multiple ages, or no age when it is not age-specific.
9. Keep each guide's organization metadata synchronized with journeyData: journeySectionKey equals its section id, listThemeKey equals its category key, phaseKeys equals the age keys containing its slug, and listThemeLabel/listThemeSubtitle/listThemeIcon copy the selected category metadata.
10. journeyData is a complete replacement when supplied, not a partial merge. Preserve every existing journey, section, category, age array, milestone, and guide reference unless the requested change explicitly modifies it. Never submit a partial journeyData object.
11. Keep all reference IDs valid. Quiz afterGuideId, sourceGuideId, and alsoAfterGuideIds must reference published guides. Do not duplicate a guide within or across categories or curriculum sections.
12. Before returning the file, verify that #guides-content is valid JSON, all existing IDs are unchanged, every new published guide is categorized and placed, organization arrays contain no accidental duplicates, and unrelated content remains unchanged.
END GUIDES AI INSTRUCTIONS -->`;
        const manifest = {
            schemaVersion: 1,
            shellContractVersion: 1,
            contentSchemaVersion: 1,
            exportedAt: new Date().toISOString(),
            description: "Describe the requested design and content changes"
        };
        const previewBootstrap = `<script id="guides-working-preview-bootstrap">(function(){if(window.GuidesAPI)return;function data(){var node=document.getElementById('guides-content');var content=JSON.parse(node&&node.textContent||'{"lessons":[]}');var journeys=content.journeyData&&content.journeyData.journeys||[];var active=journeys.find(function(j){return j.id===(content.journeyData&&content.journeyData.defaultJourneyId);})||journeys[0]||null;return {runtime:{version:1,shellContractVersion:1,preview:true},lessons:(content.lessons||[]).filter(function(g){return g.published!==false;}),quizzes:content.quizzes||[],journeyData:content.journeyData||{journeys:[]},activeJourney:active,progress:{readGuideIds:[],completedQuizIds:[],collapsedJourneySections:[],readerScrollPositions:{}},profile:{babyBirthdate:null},preferences:{},currentUser:{id:'preview-user',displayName:'Preview User',firstName:'Preview'},entitlements:{hasSubscriptions:true,subscriptions:[]}};}var value=data();window.GuidesAPI={version:1,getInitialData:function(){return Promise.resolve(value);},setGuideCompleted:function(slug,completed){var ids=new Set(value.progress.readGuideIds||[]);completed===false?ids.delete(slug):ids.add(slug);value.progress.readGuideIds=Array.from(ids);return Promise.resolve(value.progress);},setQuizCompleted:function(id,completed){var ids=new Set(value.progress.completedQuizIds||[]);completed===false?ids.delete(id):ids.add(id);value.progress.completedQuizIds=Array.from(ids);return Promise.resolve(value.progress);},setBirthdate:function(item){value.profile.babyBirthdate=item||null;return Promise.resolve(value.profile);},savePreference:function(key,item){value.preferences[key]=item;return Promise.resolve(value.preferences);},setReaderMode:function(){return Promise.resolve();},goBack:function(){return Promise.resolve();},openUrl:function(url){window.open(url,'_blank','noopener');return Promise.resolve();},openActionItem:function(){return Promise.resolve();},openPaywall:function(){return Promise.resolve();},subscribe:function(){},onBack:function(){}};}());<\/script>`;
        const blocks = instructions + "\n<script id=\"guides-release-manifest\" type=\"application/json\">\n" +
            JSON.stringify(manifest, null, 2).replace(/</g, "\\u003c") + "\n<\/script>\n<script id=\"guides-content\" type=\"application/json\">\n" +
            JSON.stringify(content, null, 2).replace(/</g, "\\u003c") + "\n<\/script>\n" + previewBootstrap;
        let clean = removeWorkingBlocks(html);
        const charsetPattern = /<meta\b(?=[^>]*\bcharset\s*=)[^>]*>/i;
        const existingCharset = clean.match(charsetPattern);
        const charset = existingCharset ? existingCharset[0] : '<meta charset="UTF-8">';
        if (existingCharset) clean = clean.replace(charsetPattern, "");
        return /<head\b[^>]*>/i.test(clean)
            ? clean.replace(/<head\b[^>]*>/i, (head) => head + "\n" + charset + "\n" + blocks)
            : charset + "\n" + blocks + "\n" + clean;
    }

    async function downloadWorkingFile() {
        try {
            setStatus("Preparing the AI working file…", "loading");
            const [snapshot, legacy] = await Promise.all([currentSnapshot(), getData(TAGS.legacyHtml)]);
            const active = state.shells.find((item) => item.releaseId === state.activeReleaseId);
            const html = active && active.html || legacy && legacy.html || starterShell();
            const content = {
                schemaVersion: 1,
                exportType: "buildfire-guides-ai-release",
                lessons: snapshot.lessons.map((lesson) => {
                    const clean = { ...lesson };
                    delete clean._recordId;
                    delete clean.summary;
                    return clean;
                }),
                quizzes: snapshot.quizzes.map((quiz) => {
                    const clean = { ...quiz };
                    delete clean._recordId;
                    return clean;
                }),
                journeyData: snapshot.journeyData,
                archivedLessonIds: [],
                archivedQuizIds: []
            };
            downloadText(addWorkingBlocks(html, content), "text/html;charset=utf-8", "guides-ai-working-file.html");
            setStatus("AI working file downloaded with current design, content, contract instructions, and stable IDs.", "success");
        } catch (error) {
            setStatus("Unable to prepare AI working file: " + errorMessage(error), "error");
        }
    }

    async function initialize() {
        if (state.initialized) return;
        state.initialized = true;
        try {
            await loadHistory();
        } catch (error) {
            setStatus("Unable to load release history: " + errorMessage(error), "error");
        }
        $("download-ai-working-file").addEventListener("click", downloadWorkingFile);
        $("discard-release").addEventListener("click", () => {
            resetPublishConfirmation();
            state.draft = null;
            renderDraft();
            setStatus("Staged release discarded.", "");
        });
        $("publish-release").addEventListener("click", publishDraft);
        ["release-update-guides", "release-update-quizzes"].forEach((id) => {
            $(id).addEventListener("change", () => {
                if (!state.draft) return;
                state.draft.options.updateGuides = $("release-update-guides").checked;
                state.draft.options.updateQuizzes = $("release-update-quizzes").checked;
                refreshDraftSelection(state.draft);
                resetPublishConfirmation();
                renderDraft();
                if (state.draft.selectionError) {
                    setPublishStatus("Select the matching content option to continue: " + state.draft.selectionError, "warning");
                } else {
                    setPublishStatus("Release content choices updated. Review the refreshed diff and preview.", "success");
                }
            });
        });
        $("delete-inactive-releases").addEventListener("click", deleteInactiveReleases);
    }

    global.GuidesReleaseManager = { stageFile, downloadActiveShell, initialize };
    initialize();
}(window));
