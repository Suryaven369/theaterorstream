/** Cinematic onboarding step registry */

export const ONBOARDING_PHASES = [
    { id: 'intro', label: 'Welcome' },
    { id: 'taste', label: 'Your taste' },
    { id: 'lifestyle', label: 'How you watch' },
    { id: 'calibrate', label: 'Fine-tune' },
    { id: 'ai', label: 'AI profile' },
    { id: 'discover', label: 'Explore TOS' },
];

export const ONBOARDING_STEPS = [
    {
        id: 'welcome',
        phase: 'intro',
        type: 'welcome',
        title: 'Your cinematic journey begins',
        subtitle: 'Build a taste profile as unique as the films you love.',
    },
    {
        id: 'ai-intro',
        phase: 'intro',
        type: 'ai-intro',
        title: 'Meet your AI companion',
        subtitle: 'It learns what you love — and gets smarter every time you watch.',
    },
    {
        id: 'identity',
        phase: 'intro',
        type: 'identity',
        title: 'Set up your profile',
        subtitle: 'Username, birthday, region & avatar',
        skipIf: (ctx) => ctx.tasteMode,
    },
    {
        id: 'favorite-movies',
        phase: 'taste',
        type: 'favorite-movies',
        title: 'Movies you love',
        subtitle: 'Pick titles that define your taste',
        minPick: 1,
        maxPick: 8,
    },
    {
        id: 'swipe-reactions',
        phase: 'taste',
        type: 'swipe-reactions',
        title: 'Quick reactions',
        subtitle: 'Swipe through films — loved it, hated it, masterpiece, or skip',
    },
    {
        id: 'emotional-taste',
        phase: 'taste',
        type: 'multi-select',
        stateKey: 'emotionalTastes',
        optionsKey: 'EMOTIONAL_TASTE_OPTIONS',
        title: 'Emotional storytelling',
        subtitle: 'What feelings do you chase in films?',
        maxPick: 4,
    },
    {
        id: 'storytelling',
        phase: 'taste',
        type: 'multi-select',
        stateKey: 'storytellingPrefs',
        optionsKey: 'STORYTELLING_OPTIONS',
        title: 'Storytelling style',
        subtitle: 'What kinds of narratives pull you in?',
        maxPick: 4,
    },
    {
        id: 'character',
        phase: 'taste',
        type: 'multi-select',
        stateKey: 'characterPrefs',
        optionsKey: 'CHARACTER_OPTIONS',
        title: 'Characters you root for',
        subtitle: 'What protagonists do you connect with?',
        maxPick: 3,
    },
    {
        id: 'world',
        phase: 'taste',
        type: 'multi-select',
        stateKey: 'worldPrefs',
        optionsKey: 'WORLD_OPTIONS',
        title: 'Cinematic worlds',
        subtitle: 'Which settings feel like home?',
        maxPick: 3,
    },
    {
        id: 'pacing-pref',
        phase: 'taste',
        type: 'single-select',
        stateKey: 'pacingPref',
        optionsKey: 'PACING_OPTIONS',
        title: 'Pacing preference',
        subtitle: 'How fast should the story move?',
    },
    {
        id: 'ending',
        phase: 'taste',
        type: 'multi-select',
        stateKey: 'endingPrefs',
        optionsKey: 'ENDING_OPTIONS',
        title: 'Endings you enjoy',
        subtitle: 'How do you like stories to conclude?',
        maxPick: 2,
    },
    {
        id: 'complexity',
        phase: 'taste',
        type: 'single-select',
        stateKey: 'complexityPref',
        optionsKey: 'COMPLEXITY_OPTIONS',
        title: 'Narrative complexity',
        subtitle: 'Easy watches or mind-bending puzzles?',
    },
    {
        id: 'mood-vibe',
        phase: 'taste',
        type: 'mood-vibe',
        title: 'Mood & vibe',
        subtitle: 'Genres and vibes that match your personality',
    },
    {
        id: 'ott',
        phase: 'lifestyle',
        type: 'ott',
        title: 'Where do you watch?',
        subtitle: 'We prioritize what you can actually stream',
    },
    {
        id: 'watching-habits',
        phase: 'lifestyle',
        type: 'single-select',
        stateKey: 'watchingHabit',
        optionsKey: 'WATCHING_HABIT_OPTIONS',
        title: 'Watching habits',
        subtitle: 'How often do you watch movies?',
    },
    {
        id: 'viewing-context',
        phase: 'lifestyle',
        type: 'viewing-context',
        title: 'Viewing context',
        subtitle: 'Who do you watch with — and family-safe mode',
    },
    {
        id: 'runtime',
        phase: 'lifestyle',
        type: 'single-select',
        stateKey: 'runtimePref',
        optionsKey: 'RUNTIME_OPTIONS',
        title: 'Runtime preference',
        subtitle: 'Short films or epic marathons?',
    },
    {
        id: 'watch-frequency',
        phase: 'lifestyle',
        type: 'single-select',
        stateKey: 'watchFrequency',
        optionsKey: 'WATCH_FREQUENCY_OPTIONS',
        title: 'How actively you watch',
        subtitle: 'Helps us calibrate recommendation intensity',
    },
    {
        id: 'emotional-goals',
        phase: 'lifestyle',
        type: 'multi-select',
        stateKey: 'emotionalGoals',
        optionsKey: 'EMOTIONAL_GOAL_OPTIONS',
        title: 'What you seek from entertainment',
        subtitle: 'Your emotional goals when you press play',
        maxPick: 3,
    },
    {
        id: 'deep-calibration-gate',
        phase: 'calibrate',
        type: 'deep-gate',
        title: 'Deep taste calibration',
        subtitle: 'Optional — for film enthusiasts who want hyper-accurate picks',
    },
    {
        id: 'directors',
        phase: 'calibrate',
        type: 'multi-select',
        stateKey: 'directorPrefs',
        optionsKey: 'DIRECTOR_OPTIONS',
        title: 'Favorite directors',
        subtitle: 'Whose vision do you trust?',
        maxPick: 5,
        skipIf: (ctx) => !ctx.state.deepCalibrationEnabled,
    },
    {
        id: 'cinematography',
        phase: 'calibrate',
        type: 'multi-select',
        stateKey: 'cinematographyPrefs',
        optionsKey: 'CINEMATOGRAPHY_OPTIONS',
        title: 'Visual style',
        subtitle: 'What cinematography speaks to you?',
        maxPick: 3,
        skipIf: (ctx) => !ctx.state.deepCalibrationEnabled,
    },
    {
        id: 'soundtrack',
        phase: 'calibrate',
        type: 'single-select',
        stateKey: 'soundtrackImportance',
        optionsKey: 'SOUNDTRACK_OPTIONS',
        title: 'Soundtrack importance',
        subtitle: 'How much does music matter to you?',
        skipIf: (ctx) => !ctx.state.deepCalibrationEnabled,
    },
    {
        id: 'ai-generating',
        phase: 'ai',
        type: 'generating',
        title: 'Building your taste profile',
        subtitle: 'Our AI is analyzing your cinematic DNA…',
    },
    {
        id: 'taste-identity',
        phase: 'ai',
        type: 'taste-identity',
        title: 'Your taste identity',
        subtitle: 'A profile crafted from everything you shared',
    },
    {
        id: 'first-recommendation',
        phase: 'ai',
        type: 'first-recommendation',
        title: 'Your first pick',
        subtitle: 'Highly personalized — with AI reasoning',
    },
    {
        id: 'home-feed-intro',
        phase: 'discover',
        type: 'feature-intro',
        icon: '🏠',
        title: 'Your home feed',
        subtitle: 'A dynamic stream that evolves as your taste grows',
        bullets: [
            'Fresh picks every visit',
            'Trending + tailored for you',
            'Gets smarter with every rating',
        ],
    },
    {
        id: 'watchlist-intro',
        phase: 'discover',
        type: 'feature-intro',
        icon: '🔖',
        title: 'Save & watchlist',
        subtitle: 'Build your personal queue of must-watch titles',
        bullets: [
            'Save anything for later',
            'Organize your cinema backlog',
            'Never lose a great recommendation',
        ],
    },
    {
        id: 'trailer-ott-intro',
        phase: 'discover',
        type: 'feature-intro',
        icon: '▶️',
        title: 'Trailers & streaming',
        subtitle: 'Watch trailers and see where films are available',
        bullets: [
            'Instant trailer previews',
            'OTT availability at a glance',
            'Filtered by your platforms',
        ],
    },
    {
        id: 'ai-explanation-intro',
        phase: 'discover',
        type: 'feature-intro',
        icon: '✨',
        title: 'AI recommendation reasons',
        subtitle: 'Every pick comes with a clear “why you’ll love this”',
        bullets: [
            'Because you enjoyed emotional sci-fi…',
            'Matched to your pacing preference',
            'Available on your streaming apps',
        ],
    },
    {
        id: 'completion',
        phase: 'discover',
        type: 'completion',
        title: 'Your AI is ready',
        subtitle: 'Time to explore a world of films made for you',
    },
];

export function getVisibleSteps(ctx) {
    return ONBOARDING_STEPS.filter((step) => !step.skipIf?.(ctx));
}

export function getStepIndex(stepId, ctx) {
    const steps = getVisibleSteps(ctx);
    return steps.findIndex((s) => s.id === stepId);
}

export function getNextStepId(stepId, ctx) {
    const steps = getVisibleSteps(ctx);
    const idx = steps.findIndex((s) => s.id === stepId);
    return idx >= 0 && idx < steps.length - 1 ? steps[idx + 1].id : null;
}

export function getPrevStepId(stepId, ctx) {
    const steps = getVisibleSteps(ctx);
    const idx = steps.findIndex((s) => s.id === stepId);
    return idx > 0 ? steps[idx - 1].id : null;
}

export function resolveInitialStepId(tasteMode, draft) {
    if (draft?.stepId) return draft.stepId;
    if (typeof draft?.step === 'number') {
        const legacy = {
            1: tasteMode ? 'ott' : 'identity',
            2: 'ott',
            3: 'mood-vibe',
            4: 'swipe-reactions',
            5: 'completion',
        };
        return legacy[draft.step] || (tasteMode ? 'favorite-movies' : 'welcome');
    }
    return tasteMode ? 'welcome' : 'welcome';
}

export function getPhaseProgress(stepId, ctx) {
    const steps = getVisibleSteps(ctx);
    const idx = steps.findIndex((s) => s.id === stepId);
    const current = steps[idx];
    if (!current || idx < 0) return { phase: 'intro', progress: 0, stepNum: 1, total: steps.length };

    const phaseSteps = steps.filter((s) => s.phase === current.phase);
    const phaseIdx = phaseSteps.findIndex((s) => s.id === stepId);

    return {
        phase: current.phase,
        phaseLabel: ONBOARDING_PHASES.find((p) => p.id === current.phase)?.label || '',
        progress: Math.round(((idx + 1) / steps.length) * 100),
        stepNum: idx + 1,
        total: steps.length,
        phaseStepNum: phaseIdx + 1,
        phaseTotal: phaseSteps.length,
    };
}
