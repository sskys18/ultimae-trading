export const round = (value: number, precision = 2) =>
  Number(value.toFixed(precision));

export const toBps = (value: number) => value * 10000;

export const premiumBps = (a: number, b: number) => ((a - b) / b) * 10000;
