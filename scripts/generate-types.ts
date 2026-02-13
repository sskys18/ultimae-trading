import { writeFileSync } from 'fs';
import { BINANCE_PAIRS } from '../src/exchanges/binance/binance-connector';
import { BITHUMB_PAIRS } from '../src/exchanges/bithumb/bithumb-connector';

const uniquePairs = Array.from(
  new Set([...Object.keys(BINANCE_PAIRS), ...Object.keys(BITHUMB_PAIRS)])
);

const content = `// Auto-generated trading pair types\nexport type TradingPairId = ${uniquePairs
  .map(key => `'${key}'`)
  .join(' | ')};\n`;

writeFileSync('src/config/generated-types.d.ts', content);
console.log('Generated src/config/generated-types.d.ts');
