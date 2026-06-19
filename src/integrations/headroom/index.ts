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
    resetManagedProxyStats,
} from './in-process-proxy';
export {
    getLocalProxyState,
    setLocalProxyState,
    onLocalProxyStateChange,
} from './proxy-state';
export type { LocalProxyState } from './proxy-state';
