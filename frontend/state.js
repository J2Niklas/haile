/**
 * HAILE — Shared State
 *
 * Central mutable state accessed by all modules.
 * Cross-module callbacks are registered here to avoid circular imports.
 */

export const state = {
    // Auth
    authToken: sessionStorage.getItem('haile-auth-token') || '',

    // Language
    selectedLanguage: 'en-US',
    inputLanguage: 'en-US',   // STT recognition language (set on sleep screen only)

    // Speech token
    speechToken: null,
    speechTokenAcquiredAt: 0,

    // Avatar
    avatarSynthesizer: null,
    avatarReady: false,
    peerConnection: null,
    avatarVideoStream: null,
    avatarInitPromise: null,
    avatarVideoReady: null,
    avatarVideoReadyResolve: null,

    // STT
    sttRecognizer: null,
    isListening: false,
    micEnabled: false,       // true while user wants the mic on (survives session restarts)
    sttAudioStream: null,
    finalizedText: '',
    sttDebounceTimer: null,

    // Speaking
    isSpeaking: false,
    speakingAborted: false,
    speechSynthesizerInstance: null,
    pendingSpeechCount: 0,
    speechGeneration: 0,
    audioAttachedForResponse: false,
    responseStreamComplete: false,
    muteRealtimeMic: false,

    // Chat
    isSending: false,
    conversationMessages: [],
    currentAssistantBubble: null,
    currentAssistantText: '',
    deferredTextQueue: [],

    // Realtime API
    realtimeWs: null,
    realtimeMode: false,
    realtimeAudioContext: null,
    realtimeSourceNode: null,
    realtimeProcessorNode: null,
    realtimeResponseActive: false,
    pendingRealtimeAssistantBubble: null,

    // ── Cross-module callbacks (wired by app.js) ──
    onSpeakComplete: () => {},
    onSendMessage: () => {},
    onStopListening: () => {},
    onResetSttText: () => {},
};
