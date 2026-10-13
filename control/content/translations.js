(function () {
    'use strict';
    const api = window.GuidesTranslations;
    const fields = document.getElementById('translations-fields');
    const save = document.getElementById('translations-save');
    const status = document.getElementById('translations-status');
    const names = {
        quizDidYouKnow: 'Did you know?', quizContinue: 'Continue button',
        quizResult: 'View result button', quizUnlockBonus: 'Unlock bonus button',
        quizBonusUnlocked: 'Bonus unlocked celebration', quizBonusSuccess: 'Bonus success (after result text)',
        quizRecapOne: 'Recap heading: one missed question', quizRecapMany: 'Recap heading: multiple missed questions',
        quizStreakMany: 'Other streak lengths'
    };
    const inputs = {};
    let saved = {};
    Object.entries(api.defaults).forEach(([key, fallback]) => {
        const row = document.createElement('div');
        row.className = 'field';
        const label = document.createElement('label');
        label.htmlFor = 'translation-' + key;
        label.textContent = names[key] || 'Streak: ' + key.replace('quizStreak', '') + ' correct answers';
        const input = document.createElement('input');
        input.type = 'text';
        input.id = label.htmlFor;
        input.placeholder = fallback;
        const hint = document.createElement('small');
        hint.textContent = 'Default: ' + fallback;
        row.append(label, input, hint);
        fields.append(row);
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
            if (input.value.trim() && api.defaults[key].includes('{count}') && !input.value.includes('{count}')) {
                status.textContent = 'Keep {count} in messages that include a number.';
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
