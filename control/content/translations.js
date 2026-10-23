(function () {
    'use strict';
    const api = window.GuidesTranslations;
    const fields = document.getElementById('translations-fields');
    const save = document.getElementById('translations-save');
    const status = document.getElementById('translations-status');
    const names = {
        guideStart: 'Start badge (guides and quizzes)',
        questions: 'Question count label', startQuiz: 'Start quiz button',
        inThisGuide: 'Reader contents heading', otherGuides: 'Other guides heading',
        moreContent: 'More content heading', references: 'References heading',
        alreadyRead: 'Already read button', markRead: 'Mark as read button',
        alreadyCompleted: 'Already completed button', markCompleted: 'Mark completed button',
        progressOf: 'Progress separator',
        quizReplay: 'Play again button', quizRetry: 'Try again button',
        quizBeatRecord: 'Beat my record button', quizPerfectTitle: 'Perfect score heading',
        quizPlayedTitle: 'Previously played heading (zero score)', quizCompletedTitle: 'Previously completed heading',
        quizAttempt: 'Attempt count', quizNewTopic: 'First learning attempt message',
        quizBestResult: 'Best result', quizNewRecord: 'New record celebration',
        quizReview: 'Review heading', quizNothingToReview: 'Perfect review heading',
        quizPerfectReview: 'Perfect review message',
        quizKicker: 'Quiz intro heading', quizDuration: 'Quiz duration', quizDurationLimit: 'Quiz duration qualifier',
        quizReadGuide: 'Read guide before quiz button', quizHits: 'Correct answers label', quizMaxStreak: 'Maximum streak label',
        quizBack: 'Back to journey button', quizComingSoon: 'Quiz coming soon message', quizPreview: 'Quiz preview message',
        resumeReading: 'Resume reading notice', summary: 'Guide summary heading', relatedGuides: 'Related guides heading',
        expectHeading: 'Milestone expectations heading', rememberHeading: 'Milestone reminders heading',
        continueHere: 'Continue here badge',
        quizDidYouKnow: 'Did you know?', quizContinue: 'Continue button',
        quizResult: 'View result button', quizUnlockBonus: 'Unlock bonus button',
        quizBonusUnlocked: 'Bonus unlocked celebration', quizBonusSuccess: 'Bonus success (after result text)',
        quizRecapOne: 'Recap heading: one missed question', quizRecapMany: 'Recap heading: multiple missed questions',
        quizStreakMany: 'Other streak lengths'
    };
    const inputs = {};
    const inputGroups = {};
    const groups = [
        ['shared', 'Shared labels'], ['age', 'Age & onboarding'], ['journey', 'Journey & list'],
        ['search', 'Search'], ['reader', 'Guide reader'], ['milestones', 'Milestones'],
        ['quizIntro', 'Quiz intro'], ['quizPlay', 'Quiz play'], ['quizResults', 'Quiz results'],
        ['fallback', 'Loading & fallback']
    ];
    function groupFor(key) {
        if (key.startsWith('fallback')) return 'fallback';
        if (/^(onboarding|birthdate|babyAge|age|phase\d|phaseYears|viewGuides|changeAge)/.test(key)) return 'age';
        if (key.startsWith('search')) return 'search';
        if (['expectHeading', 'rememberHeading'].includes(key)) return 'milestones';
        if (/^(inThisGuide|references|alreadyRead|markRead|resumeReading|summary|relatedGuides|celebration|achievement|guideName)/.test(key)) return 'reader';
        if (/^(quizResult|quizRecap|quizNewRecord|quizReview|quizNothing|quizPerfectReview|quizHits|quizMaxStreak|quizBack|quizBonusSuccess)/.test(key)) return 'quizResults';
        if (/^(quizStreak|quizContinue|quizUnlockBonus|quizBonusUnlocked|quizDidYouKnow)/.test(key)) return 'quizPlay';
        if (/^(quiz|startQuiz|alreadyCompleted|markCompleted|questions)/.test(key)) return 'quizIntro';
        if (['guideStart', 'continueHere', 'progressOf', 'readCount'].includes(key)) return 'shared';
        return 'journey';
    }
    const tabs = document.createElement('div');
    tabs.className = 'translation-tabs';
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Translation screens');
    fields.append(tabs);
    const panels = {};
    const buttons = {};
    function activate(id, focus) {
        groups.forEach(([key]) => {
            buttons[key].setAttribute('aria-selected', String(key === id));
            buttons[key].tabIndex = key === id ? 0 : -1;
            panels[key].hidden = key !== id;
        });
        if (focus) buttons[id].focus();
    }
    groups.forEach(([id, title], index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.id = 'translation-tab-' + id;
        button.textContent = title;
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-controls', 'translation-panel-' + id);
        button.addEventListener('click', () => activate(id));
        button.addEventListener('keydown', event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? groups.length - 1 :
                (index + (event.key === 'ArrowRight' ? 1 : -1) + groups.length) % groups.length;
            activate(groups[next][0], true);
        });
        const panel = document.createElement('div');
        panel.id = 'translation-panel-' + id;
        panel.className = 'translation-panel';
        panel.setAttribute('role', 'tabpanel');
        panel.setAttribute('aria-labelledby', button.id);
        const heading = document.createElement('h3');
        heading.textContent = title;
        panel.append(heading);
        panels[id] = panel;
        buttons[id] = button;
        tabs.append(button);
        fields.append(panel);
    });
    activate('shared');
    let saved = {};
    Object.entries(api.defaults).forEach(([key, fallback]) => {
        const row = document.createElement('div');
        row.className = 'field';
        const label = document.createElement('label');
        label.htmlFor = 'translation-' + key;
        label.textContent = names[key] || (/^quizStreak\d+$/.test(key) ? 'Streak: ' + key.replace('quizStreak', '') + ' correct answers' : key.replace(/([A-Z])/g, ' $1').replace(/^./, letter => letter.toUpperCase()));
        const input = document.createElement('input');
        input.type = 'text';
        input.id = label.htmlFor;
        input.placeholder = fallback;
        const hint = document.createElement('small');
        hint.textContent = 'Default: ' + fallback;
        row.append(label, input, hint);
        const group = groupFor(key);
        panels[group].append(row);
        inputGroups[key] = group;
        inputs[key] = input;
    });
    status.textContent = 'Loading translations...';
    buildfire.datastore.get(api.tag, (error, result) => {
        if (error) {
            status.textContent = 'Unable to load translations. Reload the page to try again.';
            return;
        }
        saved = result && result.data || {};
        Object.entries(inputs).forEach(([key, input]) => {
            input.value = typeof saved[key] === 'string' ? saved[key] : '';
        });
        fields.disabled = save.disabled = false;
        status.textContent = '';
    });
    document.getElementById('translations-form').addEventListener('submit', event => {
        event.preventDefault();
        const data = { ...saved };
        for (const [key, input] of Object.entries(inputs)) {
            const missing = (api.defaults[key].match(/\{\w+\}/g) || []).filter(token => !input.value.includes(token));
            if (input.value.trim() && missing.length) {
                status.textContent = 'Keep ' + missing.join(', ') + ' in this message.';
                activate(inputGroups[key]);
                input.focus();
                return;
            }
            if (input.value.trim()) data[key] = input.value;
            else delete data[key];
        }
        fields.disabled = save.disabled = true;
        status.textContent = 'Saving translations...';
        buildfire.datastore.save(data, api.tag, error => {
            fields.disabled = save.disabled = false;
            if (!error) saved = data;
            status.textContent = error ? 'Unable to save translations. Please try again.' : 'Translations saved.';
        });
    });
}());
