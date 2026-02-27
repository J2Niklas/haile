/**
 * HAILE — Shared State
 *
 * Central mutable state accessed by all modules.
 * Cross-module callbacks are registered here to avoid circular imports.
 */

export const state = {
    // Auth
    authToken: sessionStorage.getItem('haile-auth-token') || '',

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

    // Chat
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
};
