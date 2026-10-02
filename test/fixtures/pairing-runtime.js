import worker from '../../workers/pairing/index.js';

export default {
    fetch(request, env) {
        return worker.fetch(request, {
            ...env,
            PAIRING_RATE_LIMITER: { limit: async () => ({ success: true }) },
        });
    },
};
