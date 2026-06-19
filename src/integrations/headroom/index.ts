export {
    detectHeadroom,
    compressMessages,
    getCompressionStats,
    resetCompressionStats,
    getAvailability,
    disposeHeadroomClient,
    simulateMessages,
    getCCRStats,
    retrieveFromCCR,
} from './headroom-compressor';
export type {
    HeadroomAvailability,
    CompressionStats,
} from './headroom-compressor';
export {
    startInProcessProxy,
    getManagedProxyStats,
    getRecentCalls,
    resetManagedProxyStats,
    _clearRecentCallsForTest,
    _pushRecentCallForTest,
} from './in-process-proxy';
export type { RecentCompressCall } from './in-process-proxy';
export {
    getLocalProxyState,
    setLocalProxyState,
    onLocalProxyStateChange,
} from './proxy-state';
export type { LocalProxyState } from './proxy-state';
