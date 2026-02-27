/**
 * HAILE — Configuration
 *
 * API endpoint and tuning constants.
 * The deploy script replaces the localhost URL for production.
 */

export const API_BASE = 'http://localhost:7071/api';
export const WS_BASE = API_BASE.replace('http', 'ws');

export const STT_SILENCE_MS = 600;
export const BARGEIN_MIN_WORDS = 2;
export const SPEECH_TOKEN_LIFETIME_MS = 8 * 60 * 1000;

export const GREETING_TEXT =
    "Hi there, great to see you! I'm HAILE and I know a lot about Oticon's latest product line. Go ahead, ask me anything!";
