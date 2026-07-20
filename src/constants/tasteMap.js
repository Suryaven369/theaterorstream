/** Taste Map UI vocabulary — mirrors server DNA + axis keys. */

export const DNA_TRAIT_LABELS = {
    mind_bending: 'Mind-Bending',
    plot_twist: 'Plot Twist',
    psychological: 'Psychological',
    emotional: 'Emotional',
    feel_good: 'Feel-Good',
    dark: 'Dark',
    suspenseful: 'Suspenseful',
    thought_provoking: 'Thought-Provoking',
    slow_burn: 'Slow Burn',
    fast_paced: 'Fast-Paced',
    family_friendly: 'Family-Friendly',
    inspirational: 'Inspirational',
    action_heavy: 'Action-Heavy',
    mystery_driven: 'Mystery-Driven',
    crime_focused: 'Crime',
    character_driven: 'Character-Driven',
    dialogue_heavy: 'Dialogue-Heavy',
    atmospheric: 'Atmospheric',
    intense: 'Intense',
    philosophical: 'Philosophical',
    epic: 'Epic',
    romantic: 'Romantic',
    funny: 'Funny',
    tearjerker: 'Tearjerker',
};

export const AXIS_LABELS = {
    acting: 'Acting',
    screenplay: 'Screenplay',
    sound: 'Sound & score',
    direction: 'Direction',
    entertainment: 'Entertainment',
    pacing: 'Pacing',
    cinematography: 'Cinematography',
};

export const SPECTRUM_DEFS = [
    {
        id: 'complexity',
        label: 'Story complexity',
        left: 'Simple and direct',
        right: 'Layered and complex',
        lowTraits: ['feel_good', 'funny', 'family_friendly'],
        highTraits: ['mind_bending', 'thought_provoking', 'philosophical', 'plot_twist'],
    },
    {
        id: 'pace',
        label: 'Pace',
        left: 'Slow and meditative',
        right: 'Fast and relentless',
        lowTraits: ['slow_burn', 'atmospheric', 'character_driven'],
        highTraits: ['fast_paced', 'action_heavy', 'intense'],
    },
    {
        id: 'emotional',
        label: 'Emotional weight',
        left: 'Light and easy',
        right: 'Deep and heavy',
        lowTraits: ['feel_good', 'funny', 'family_friendly'],
        highTraits: ['tearjerker', 'emotional', 'dark', 'intense'],
    },
    {
        id: 'predictability',
        label: 'Predictability',
        left: 'Familiar and satisfying',
        right: 'Surprising and unpredictable',
        lowTraits: ['feel_good', 'family_friendly', 'inspirational'],
        highTraits: ['mind_bending', 'plot_twist', 'psychological'],
    },
    {
        id: 'tone',
        label: 'Tone',
        left: 'Hopeful and warm',
        right: 'Dark and cynical',
        lowTraits: ['feel_good', 'inspirational', 'romantic', 'funny'],
        highTraits: ['dark', 'psychological', 'crime_focused', 'intense'],
    },
    {
        id: 'attention',
        label: 'Attention requirement',
        left: 'Easy casual watch',
        right: 'Full concentration',
        lowTraits: ['feel_good', 'funny', 'action_heavy'],
        highTraits: ['mind_bending', 'dialogue_heavy', 'thought_provoking', 'slow_burn'],
    },
    {
        id: 'dialogue',
        label: 'Dialogue density',
        left: 'Visually driven',
        right: 'Dialogue-heavy',
        lowTraits: ['epic', 'atmospheric', 'action_heavy'],
        highTraits: ['dialogue_heavy', 'character_driven', 'philosophical'],
    },
    {
        id: 'spectacle',
        label: 'Spectacle',
        left: 'Intimate and subtle',
        right: 'Large and cinematic',
        lowTraits: ['character_driven', 'dialogue_heavy', 'romantic'],
        highTraits: ['epic', 'action_heavy', 'atmospheric'],
    },
];

export const CONTENT_BOUNDARY_TYPES = [
    { id: 'graphic_violence', label: 'Graphic violence' },
    { id: 'gore', label: 'Gore' },
    { id: 'jump_scares', label: 'Jump scares' },
    { id: 'sexual_content', label: 'Sexual content' },
    { id: 'abuse', label: 'Abuse' },
    { id: 'self_harm', label: 'Self-harm themes' },
    { id: 'suicide', label: 'Suicide themes' },
    { id: 'child_harm', label: 'Child harm' },
    { id: 'animal_harm', label: 'Animal harm' },
    { id: 'grief', label: 'Grief' },
    { id: 'terminal_illness', label: 'Terminal illness' },
    { id: 'addiction', label: 'Addiction' },
    { id: 'claustrophobia', label: 'Claustrophobia' },
    { id: 'disturbing_imagery', label: 'Disturbing imagery' },
];

export const BOUNDARY_LEVELS = [
    { id: 'comfortable', label: 'Comfortable' },
    { id: 'warn', label: 'Warn me first' },
    { id: 'avoid', label: 'Prefer to avoid' },
    { id: 'block', label: 'Never recommend' },
    { id: 'no_preference', label: 'No preference' },
];

export const DISCOVERY_LEVELS = [
    {
        id: 1,
        label: 'Very safe',
        blurb: 'Stick close to films that already match your strongest tastes.',
        mix: '90% strong matches · 10% adjacent',
    },
    {
        id: 2,
        label: 'Mostly familiar',
        blurb: 'Mostly safe picks with a few titles that stretch one dimension.',
        mix: '80% strong matches · 15% adjacent · 5% wildcards',
    },
    {
        id: 3,
        label: 'Balanced',
        blurb: 'Strong taste matches with occasional adjacent discoveries.',
        mix: '75% strong matches · 20% adjacent · 5% wildcards',
    },
    {
        id: 4,
        label: 'Adventurous',
        blurb: 'More international, indie, and outside-comfort suggestions.',
        mix: '55% strong matches · 30% adjacent · 15% wildcards',
    },
    {
        id: 5,
        label: 'Highly exploratory',
        blurb: 'Surprise me often — still filtered by hard boundaries you set.',
        mix: '40% strong matches · 35% adjacent · 25% wildcards',
    },
];

export const VIEWING_MODE_KEYS = [
    { id: 'solo', label: 'Watching alone' },
    { id: 'partner', label: 'With a partner' },
    { id: 'friends', label: 'With friends' },
    { id: 'family', label: 'With family' },
    { id: 'theatre', label: 'At the theatre' },
    { id: 'home', label: 'At home' },
];

export const EMOTION_CHIPS = [
    'Excited', 'Comforted', 'Curious', 'Emotionally moved', 'Inspired', 'Tense',
    'Relaxed', 'Frightened', 'Hopeful', 'Nostalgic', 'Amazed', 'Romantic',
    'Intellectually challenged', 'Cathartically sad', 'Energised', 'Disturbed',
    'Amused', 'Escaped from reality',
];
