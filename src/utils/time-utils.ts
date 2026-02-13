export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export const unix = () => Date.now();
export const formatDuration = (ms: number) => `${(ms / 1000).toFixed(2)}s`;
