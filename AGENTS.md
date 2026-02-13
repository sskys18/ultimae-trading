# Cross-Exchange Arbitrage Bot Technical Design Document
## Kimchi/Reverse-Kimchi Premium Strategy Implementation

---

## Executive Summary

### Project Overview
- **System Name**: Cross-Exchange Arbitrage Bot (CEAB)
- **Version**: 1.0.0
- **Primary Strategy**: Kimchi Premium Arbitrage
- **Target Exchanges**: Bithumb (KR) ↔ Binance (Global)
- **Technology Stack**: TypeScript, Node.js, Puppeteer/Playwright
- **Deployment Model**: Initially local, cloud-ready architecture

### Key Objectives
1. Capture price premiums between Korean and global crypto markets
2. Automate complete arbitrage cycles using margin trading
3. Minimize risk through configurable thresholds and real-time monitoring
4. Maintain 24/7 operation with automatic recovery mechanisms

### Core Trading Strategies

#### Kimchi Premium Flow (Korea Premium > Threshold)
```
1. Premium Detection: Monitor BTC/KRW (Bithumb) vs BTC/USDT (Binance) using KRW/USDT rate
2. Borrow BTC from Binance Margin
3. Transfer BTC: Binance → Bithumb
4. Sell BTC for KRW on Bithumb
5. Buy USDT with KRW on Bithumb (using KRW/USDT pair)
6. Transfer USDT: Bithumb → Binance
7. Buy BTC with USDT on Binance
8. Repay BTC loan to Binance Margin
9. Result: Profit in remaining USDT
```

#### Reverse Premium Flow (Global Premium > Korea)
```
1. Reverse Premium Detection
2. Borrow BTC from Bithumb Margin
3. Sell BTC for KRW on Bithumb
4. Buy USDT with KRW on Bithumb (using KRW/USDT pair)
5. Transfer USDT: Bithumb → Binance
6. Buy BTC with USDT on Binance
7. Transfer BTC: Binance → Bithumb
8. Repay BTC loan to Bithumb Margin
9. Result: Profit in remaining USDT
```

### FX Rate Methodology
- **Primary FX Feed**: Bithumb's KRW/USDT trading pair
- **Real-time Rate**: Direct market price from Bithumb order book
- **No External FX API**: Eliminates dependency on third-party forex data
- **Calculation**: `Effective_Bithumb_Price = BTC_KRW_Price / USDT_KRW_Price`

---

## System Architecture

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        ARBITRAGE BOT SYSTEM                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    CORE ENGINE LAYER                      │   │
│  │                                                           │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │   │
│  │  │   Strategy   │  │     Risk     │  │   Execution   │  │   │
│  │  │    Engine    │  │  Management  │  │    Engine     │  │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    SERVICE LAYER                          │   │
│  │                                                           │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────────┐    │   │
│  │  │   Market   │  │  Transfer  │  │      Web       │    │   │
│  │  │   Data     │  │  Tracker   │  │   Automation   │    │   │
│  │  │  Service   │  │  Service   │  │    Service     │    │   │
│  │  └────────────┘  └────────────┘  └────────────────┘    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                 EXCHANGE CONNECTOR LAYER                  │   │
│  │                                                           │   │
│  │  ┌──────────────────┐        ┌──────────────────┐       │   │
│  │  │   Binance API     │        │   Bithumb API    │       │   │
│  │  │    Connector      │        │    Connector      │       │   │
│  │  └──────────────────┘        └──────────────────┘       │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                   INFRASTRUCTURE LAYER                    │   │
│  │                                                           │   │
│  │  ┌────────────┐  ┌────────────┐  ┌──────────────┐      │   │
│  │  │  Logging   │  │  Telegram  │  │    Config     │      │   │
│  │  │   System   │  │   Notifier │  │   Manager     │      │   │
│  │  └────────────┘  └────────────┘  └──────────────┘      │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Component Interaction Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Market  │────▶│ Strategy │────▶│   Risk   │────▶│Execution │
│   Data   │     │  Engine  │     │  Check   │     │  Engine  │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
     ▲                                                     │
     │                                                     ▼
┌──────────┐                                      ┌──────────────┐
│ Exchange │◀──────────────────────────────────── │   Exchange   │
│   APIs   │                                      │  Operations  │
└──────────┘                                      └──────────────┘
```

### Project Folder Structure

```
kimchi-arbitrage-bot/
├── src/
│   ├── core/                      # Core business logic
│   │   ├── strategy-engine.ts     # Premium calculation & opportunity detection
│   │   ├── execution-engine.ts    # Trade execution orchestration
│   │   ├── risk-manager.ts        # Risk assessment and limits
│   │   └── position-manager.ts    # Position tracking and management
│   │
│   ├── exchanges/                 # Exchange integrations
│   │   ├── binance/
│   │   │   ├── binance-connector.ts    # Binance API wrapper
│   │   │   ├── binance-rest-client.ts  # REST API implementation
│   │   │   ├── binance-auth.ts         # Authentication & signing
│   │   │   └── binance-types.ts        # TypeScript interfaces
│   │   │
│   │   ├── bithumb/
│   │   │   ├── bithumb-connector.ts    # Bithumb API wrapper
│   │   │   ├── bithumb-rest-client.ts  # REST API implementation
│   │   │   ├── bithumb-auth.ts         # Authentication & signing
│   │   │   └── bithumb-types.ts        # TypeScript interfaces
│   │   │
│   │   └── common/
│   │       ├── exchange-interface.ts   # Common exchange interface
│   │       ├── order-types.ts          # Shared order types
│   │       └── market-data-types.ts    # Shared market data types
│   │
│   ├── automation/                # Web automation
│   │   ├── bithumb-automation.ts  # Bithumb margin web automation
│   │   ├── browser-manager.ts     # Browser instance management
│   │   ├── page-actions.ts        # Common page interactions
│   │   └── screenshots/            # Error screenshots directory
│   │
│   ├── services/                  # Support services
│   │   ├── market-data-service.ts # Market data aggregation
│   │   ├── transfer-tracker.ts    # Transfer monitoring
│   │   ├── alert-service.ts       # Alert management
│   │   └── cache-service.ts       # Data caching
│   │
│   ├── monitoring/                # Monitoring & alerts
│   │   ├── telegram-bot.ts        # Telegram notifications
│   │   ├── metrics-collector.ts   # Performance metrics
│   │   ├── health-check.ts        # System health monitoring
│   │   └── dashboard-api.ts       # Monitoring API endpoints
│   │
│   ├── config/                    # Configuration
│   │   ├── config.ts               # Configuration manager
│   │   ├── constants.ts           # System constants
│   │   └── trading-pairs.ts       # Trading pair configurations
│   │
│   ├── utils/                     # Utilities
│   │   ├── logger.ts               # Logging utility
│   │   ├── crypto-utils.ts        # Cryptographic utilities
│   │   ├── time-utils.ts          # Time/date utilities
│   │   ├── math-utils.ts          # Mathematical utilities
│   │   └── retry-utils.ts         # Retry logic utilities
│   └── index.ts                   # Application entry point
│
├── tests/                          # Test files
│   ├── unit/                      # Unit tests
│   ├── integration/               # Integration tests
│   │   ├── exchanges/
│   │   │   ├── binance-api.test.ts     # Binance API integration
│   │   │   ├── bithumb-api.test.ts     # Bithumb API integration
│   │   │   └── cross-exchange.test.ts  # Cross-exchange operations
│   │   │
│   │   ├── automation/
│   │   │   └── bithumb-web.test.ts     # Web automation tests
│   │   │
│   │   └── flows/
│   │       ├── kimchi-flow.test.ts     # Kimchi premium flow
│   │       └── reverse-flow.test.ts    # Reverse premium flow
│   │
│   ├── e2e/                       # End-to-end tests
│   │   ├── full-cycle.test.ts     # Complete arbitrage cycle
│   │   └── paper-trading.test.ts  # Paper trading simulation
├── scripts/                        # Utility scripts
│   ├── setup.sh                   # Initial setup script
│   ├── deploy.sh                  # Deployment script
│   ├── test-connections.ts        # Test exchange connections
│   └── generate-types.ts          # Generate TypeScript types
│
├── config/                         # Configuration files
│   ├── default.yaml               # Default configuration
│   ├── development.yaml           # Development config
│   ├── staging.yaml               # Staging config
│   └── production.yaml            # Production config
│
├── logs/                          # Log files
│   ├── app/                      # Application logs
│   ├── trades/                   # Trade execution logs
│   └── errors/                   # Error logs
│
├── docs/                          # Documentation
│   ├── API.md                     # API documentation
│   ├── DEPLOYMENT.md              # Deployment guide
│   ├── TESTING.md                 # Testing guide
│   └── TROUBLESHOOTING.md         # Troubleshooting guide
│
├── .env.example                   # Environment variables example
├── .gitignore                     # Git ignore file
├── .eslintrc.json                 # ESLint configuration
├── .prettierrc                    # Prettier configuration
├── tsconfig.json                  # TypeScript configuration
├── package.json                   # NPM package file
├── ecosystem.config.js            # PM2 configuration
├── jest.config.js                 # Jest testing configuration
└── README.md                      # Project readme
```

---

## Core Components

### 1. Strategy Engine (`/src/core/strategy-engine.ts`)

```typescript
interface StrategyEngine {
  // Core methods
  calculatePremium(pair: string): PremiumData;
  detectArbitrageOpportunity(): ArbitrageSignal | null;
  generateExecutionPlan(signal: ArbitrageSignal): ExecutionPlan;
  
  // Configuration
  setThresholds(thresholds: ThresholdConfig): void;
  updateMarketConditions(conditions: MarketConditions): void;
}

interface PremiumData {
  pair: string;
  bithumbPriceKRW: number;      // BTC/KRW price at Bithumb
  binancePriceUSDT: number;     // BTC/USDT price at Binance
  krwPerUsdt: number;           // KRW/USDT rate from Bithumb
  effectiveBithumbPrice: number; // Bithumb price converted to USDT
  premiumPercentage: number;
  estimatedProfit: number;
  timestamp: Date;
  direction: 'KIMCHI' | 'REVERSE';
}

class PremiumCalculator {
  async calculateKimchiPremium(asset: string): Promise<PremiumData> {
    // Get prices from both exchanges
    const bithumbPriceKRW = await this.bithumb.getTicker(`${asset}_KRW`).last;
    const binancePriceUSDT = await this.binance.getTicker(`${asset}USDT`).last;
    
    // Get KRW/USDT rate from Bithumb
    const krwPerUsdt = await this.bithumb.getTicker('USDT_KRW').last;
    
    // Convert Bithumb KRW price to USDT equivalent
    const effectiveBithumbPrice = bithumbPriceKRW / krwPerUsdt;
    
    // Calculate premium percentage
    const premiumPercentage = ((effectiveBithumbPrice - binancePriceUSDT) / binancePriceUSDT) * 100;
    
    return {
      pair: asset,
      bithumbPriceKRW,
      binancePriceUSDT,
      krwPerUsdt,
      effectiveBithumbPrice,
      premiumPercentage,
      estimatedProfit: this.calculateProfit(premiumPercentage),
      timestamp: new Date(),
      direction: premiumPercentage > 0 ? 'KIMCHI' : 'REVERSE'
    };
  }
}

interface ArbitrageSignal {
  type: 'KIMCHI_PREMIUM' | 'REVERSE_PREMIUM';
  pair: string;
  expectedProfit: number;
  requiredCapital: number;
  estimatedDuration: number;
  confidence: number;
}
```

### 2. Risk Management Module (`/src/core/risk-manager.ts`)

```typescript
interface RiskManager {
  // Risk assessment
  assessPosition(plan: ExecutionPlan): RiskAssessment;
  checkLimits(amount: number, pair: string): boolean;
  calculateMaxPosition(balance: Balance): number;
  
  // Risk monitoring
  monitorOpenPositions(): void;
  triggerEmergencyStop(): void;
  
  // Configuration
  limits: RiskLimits;
}

interface RiskLimits {
  maxPositionSize: number;
  maxDailyLoss: number;
  minPremiumThreshold: number;
  maxSlippage: number;
  maxTransferTime: number;
  interestRateThreshold: number;
  emergencyStopLoss: number;
}
```

### 3. FX Feed Monitor (`/src/core/fx-monitor.ts`)

```typescript
interface FXMonitor {
  // KRW/USDT pair monitoring
  startMonitoring(): void;
  stopMonitoring(): void;
  getSpread(): SpreadData;
  getLiquidity(): LiquidityData;
  assessSlippage(amount: number): SlippageEstimate;
}

class KRWUSDTMonitor implements FXMonitor {
  private bithumb: BithumbConnector;
  private alertThresholds: FXAlertThresholds;
  private pollingTimer: NodeJS.Timer | null = null;
  private config: FXMonitorConfig;
  private lastOrderBook: OrderBook | null = null;
  
  async startMonitoring(): Promise<void> {
    // Poll KRW/USDT orderbook at configured interval
    this.pollingTimer = setInterval(async () => {
      try {
        const orderBook = await this.bithumb.getOrderBook('USDT_KRW');
        this.lastOrderBook = orderBook;
        this.updateMetrics(orderBook);
        this.checkAlertConditions();
      } catch (error) {
        logger.error('FX monitoring error', error);
      }
    }, this.config.pollingInterval);
    
    // Initial fetch
    const orderBook = await this.bithumb.getOrderBook('USDT_KRW');
    this.lastOrderBook = orderBook;
  }
  
  stopMonitoring(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }
  
  async getSpread(): Promise<SpreadData> {
    const orderBook = this.lastOrderBook || await this.bithumb.getOrderBook('USDT_KRW');
    
    return {
      bestBid: orderBook.bids[0][0],
      bestAsk: orderBook.asks[0][0],
      spread: orderBook.asks[0][0] - orderBook.bids[0][0],
      spreadPercentage: ((orderBook.asks[0][0] - orderBook.bids[0][0]) / orderBook.bids[0][0]) * 100,
      midPrice: (orderBook.asks[0][0] + orderBook.bids[0][0]) / 2,
      timestamp: new Date()
    };
  }
  
  async getLiquidity(): Promise<LiquidityData> {
    const orderBook = this.lastOrderBook || await this.bithumb.getOrderBook('USDT_KRW');
    
    // Calculate liquidity at different levels
    const bidLiquidity = this.calculateLiquidity(orderBook.bids, 5);
    const askLiquidity = this.calculateLiquidity(orderBook.asks, 5);
    
    return {
      bidDepth: bidLiquidity,
      askDepth: askLiquidity,
      totalLiquidity: bidLiquidity.totalValue + askLiquidity.totalValue,
      imbalance: (askLiquidity.totalVolume - bidLiquidity.totalVolume) / (askLiquidity.totalVolume + bidLiquidity.totalVolume),
      timestamp: new Date()
    };
  }
  
  async assessSlippage(amountKRW: number): Promise<SlippageEstimate> {
    const orderBook = this.lastOrderBook || await this.bithumb.getOrderBook('USDT_KRW');
    
    // Calculate how much USDT we can buy with the given KRW amount
    let remainingKRW = amountKRW;
    let totalUSDT = 0;
    let weightedPrice = 0;
    
    for (const [price, volume] of orderBook.asks) {
      const krwAtThisLevel = volume * price;
      
      if (remainingKRW <= krwAtThisLevel) {
        totalUSDT += remainingKRW / price;
        weightedPrice += price * (remainingKRW / amountKRW);
        break;
      } else {
        totalUSDT += volume;
        weightedPrice += price * (krwAtThisLevel / amountKRW);
        remainingKRW -= krwAtThisLevel;
      }
    }
    
    const spotPrice = orderBook.asks[0][0];
    const slippage = ((weightedPrice - spotPrice) / spotPrice) * 100;
    
    return {
      expectedPrice: weightedPrice,
      spotPrice,
      slippagePercent: slippage,
      totalUSDT,
      impactLevel: slippage > 1 ? 'HIGH' : slippage > 0.5 ? 'MEDIUM' : 'LOW'
    };
  }
}

interface FXMonitorConfig {
  pollingInterval: number;       // Default: 500ms for FX feed
  cacheExpiry: number;          // Default: 1000ms
  useCache: boolean;            // Default: true
}

interface FXAlertThresholds {
  maxSpread: number;           // Alert if spread > threshold (e.g., 0.5%)
  minLiquidity: number;        // Alert if liquidity < threshold (e.g., $100k)
  maxImbalance: number;        // Alert if order book imbalance > threshold (e.g., 0.3)
  maxSlippage: number;         // Alert if expected slippage > threshold (e.g., 1%)
}
```

### 4. Execution Engine (`/src/core/execution-engine.ts`)

```typescript
interface ExecutionEngine {
  // Execution flow
  executeKimchiPremium(plan: ExecutionPlan): Promise<ExecutionResult>;
  executeReversePremium(plan: ExecutionPlan): Promise<ExecutionResult>;
  
  // Transaction management
  borrowAsset(exchange: Exchange, asset: string, amount: number): Promise<LoanDetails>;
  transferAsset(from: Exchange, to: Exchange, asset: string, amount: number): Promise<TransferResult>;
  tradeSpot(exchange: Exchange, pair: string, side: 'BUY' | 'SELL', amount: number): Promise<TradeResult>;
  repayLoan(exchange: Exchange, loanId: string): Promise<RepaymentResult>;
  
  // State management
  currentPositions: Map<string, Position>;
  pendingTransfers: Map<string, Transfer>;
}
```

---

## API Integration Specifications

### Binance API Integration (REST Only)

```typescript
// /src/exchanges/binance/binance-connector.ts
class BinanceConnector implements ExchangeConnector {
  private restClient: BinanceRestClient;
  private pollingIntervals: Map<string, NodeJS.Timer>;
  private config: BinanceConfig;
  
  // Market Data Methods (REST API)
  async getOrderBook(symbol: string): Promise<OrderBook> {}
  async getTicker(symbol: string): Promise<Ticker> {}
  async getMultipleTickers(symbols: string[]): Promise<Map<string, Ticker>> {}
  
  // Polling Methods
  startPolling(symbol: string, callback: TickerCallback, intervalMs?: number): void {
    const interval = intervalMs || this.config.defaultPollingInterval;
    
    const timer = setInterval(async () => {
      try {
        const ticker = await this.getTicker(symbol);
        callback(ticker);
      } catch (error) {
        logger.error(`Polling error for ${symbol}`, error);
      }
    }, interval);
    
    this.pollingIntervals.set(symbol, timer);
  }
  
  stopPolling(symbol: string): void {
    const timer = this.pollingIntervals.get(symbol);
    if (timer) {
      clearInterval(timer);
      this.pollingIntervals.delete(symbol);
    }
  }
  
  // Trading Methods
  async placeLimitOrder(params: OrderParams): Promise<OrderResult> {}
  async placeMarketOrder(params: OrderParams): Promise<OrderResult> {}
  async cancelOrder(orderId: string): Promise<boolean> {}
  async getOrderStatus(orderId: string): Promise<OrderStatus> {}
  
  // Margin Trading Methods
  async getMarginAccount(): Promise<MarginAccount> {}
  async borrowMargin(asset: string, amount: number): Promise<LoanResult> {}
  async repayMargin(asset: string, amount: number): Promise<RepayResult> {}
  async getMarginInterestRate(asset: string): Promise<InterestRate> {}
  
  // Transfer Methods
  async withdraw(params: WithdrawParams): Promise<WithdrawResult> {}
  async getDepositAddress(asset: string): Promise<DepositAddress> {}
  async getWithdrawHistory(): Promise<WithdrawHistory[]> {}
  async getDepositHistory(): Promise<DepositHistory[]> {}
}

// Configuration
interface BinanceConfig {
  apiKey: string;
  apiSecret: string;
  baseUrl: string;
  testnet: boolean;
  recvWindow: number;
  requestTimeout: number;
  
  // Polling intervals (ms)
  defaultPollingInterval: number;      // Default: 1000ms
  orderBookPollingInterval: number;    // Default: 500ms
  tickerPollingInterval: number;        // Default: 1000ms
  balancePollingInterval: number;      // Default: 5000ms
  transferCheckInterval: number;       // Default: 10000ms
}
```

### Bithumb API Integration (REST Only)

```typescript
// /src/exchanges/bithumb/bithumb-connector.ts
class BithumbConnector implements ExchangeConnector {
  private restClient: BithumbRestClient;
  private webAutomation: BithumbWebAutomation;
  private pollingIntervals: Map<string, NodeJS.Timer>;
  private config: BithumbConfig;
  
  // Market Data Methods (REST API)
  async getOrderBook(symbol: string): Promise<OrderBook> {}
  async getTicker(symbol: string): Promise<Ticker> {}
  async getMultipleTickers(symbols: string[]): Promise<Map<string, Ticker>> {}
  async getKRWUSDTRate(): Promise<number> {
    // Use Bithumb's KRW/USDT pair as FX feed
    const ticker = await this.getTicker('USDT_KRW');
    return ticker.last; // KRW per USDT
  }
  
  // Polling Methods
  startPolling(symbol: string, callback: TickerCallback, intervalMs?: number): void {
    const interval = intervalMs || this.config.defaultPollingInterval;
    
    const timer = setInterval(async () => {
      try {
        const ticker = await this.getTicker(symbol);
        callback(ticker);
      } catch (error) {
        logger.error(`Bithumb polling error for ${symbol}`, error);
      }
    }, interval);
    
    this.pollingIntervals.set(symbol, timer);
  }
  
  stopPolling(symbol: string): void {
    const timer = this.pollingIntervals.get(symbol);
    if (timer) {
      clearInterval(timer);
      this.pollingIntervals.delete(symbol);
    }
  }
  
  // Trading Methods
  async placeLimitOrder(params: OrderParams): Promise<OrderResult> {}
  async placeMarketOrder(params: OrderParams): Promise<OrderResult> {}
  async cancelOrder(orderId: string): Promise<boolean> {}
  async getOrderStatus(orderId: string): Promise<OrderStatus> {}
  
  // Direct KRW/USDT Trading
  async tradeKRWUSDT(side: 'BUY' | 'SELL', amount: number): Promise<TradeResult> {
    // Direct trading on KRW/USDT pair
    return this.placeMarketOrder({
      symbol: 'USDT_KRW',
      side,
      amount,
      type: 'MARKET'
    });
  }
  
  async getKRWBalance(): Promise<number> {}
  async getUSDTBalance(): Promise<number> {}
  
  // Transfer Methods
  async withdraw(params: WithdrawParams): Promise<WithdrawResult> {}
  async getDepositAddress(asset: string): Promise<DepositAddress> {}
  async getWithdrawalStatus(withdrawalId: string): Promise<WithdrawalStatus> {}
  
  // Margin Trading (via Web Automation)
  async borrowMarginWeb(asset: string, amount: number): Promise<LoanResult> {}
  async repayMarginWeb(loanId: string): Promise<RepayResult> {}
  async getMarginStatusWeb(): Promise<MarginStatus> {}
}

// Configuration
interface BithumbConfig {
  apiKey: string;
  apiSecret: string;
  baseUrl: string;
  
  // Polling intervals (ms)
  defaultPollingInterval: number;      // Default: 1000ms
  orderBookPollingInterval: number;    // Default: 500ms
  tickerPollingInterval: number;        // Default: 1000ms
  balancePollingInterval: number;      // Default: 5000ms
  
  // Web automation config
  loginCredentials: {
    username: string;
    password: string;
    otpSecret?: string;
  };
  headless: boolean;
  screenshotOnError: boolean;
}
```

---

## Web Automation Framework

### Bithumb Margin Operations Flow

```typescript
// /src/automation/bithumb-automation.ts
class BithumbWebAutomation {
  private browser: Browser;
  private page: Page;
  private config: AutomationConfig;
  
  async initialize(): Promise<void> {
    this.browser = await playwright.chromium.launch({
      headless: this.config.headless,
      args: ['--disable-blink-features=AutomationControlled']
    });
    
    this.page = await this.browser.newPage();
    await this.setupInterceptors();
    await this.login();
  }
  
  async borrowMargin(asset: string, amount: number): Promise<LoanResult> {
    try {
      // Navigate to margin trading page
      await this.navigateToMarginTrading();
      
      // Select asset and amount
      await this.selectAsset(asset);
      await this.enterAmount(amount);
      
      // Verify terms and conditions
      await this.acceptTerms();
      
      // Execute borrow with 2FA if required
      await this.executeBorrow();
      
      // Capture confirmation
      const confirmation = await this.captureConfirmation();
      
      return {
        success: true,
        loanId: confirmation.loanId,
        amount: confirmation.amount,
        interestRate: confirmation.rate,
        screenshot: await this.page.screenshot()
      };
    } catch (error) {
      await this.handleAutomationError(error);
      throw error;
    }
  }
  
  private async handleAutomationError(error: Error): Promise<void> {
    // Take screenshot for debugging
    await this.page.screenshot({ 
      path: `./logs/errors/bithumb-${Date.now()}.png` 
    });
    
    // Log detailed error
    logger.error('Bithumb automation failed', {
      error: error.message,
      stack: error.stack,
      page: await this.page.url()
    });
    
    // Attempt recovery
    await this.recoverFromError();
  }
}

// Automation flow diagram
interface AutomationFlow {
  steps: [
    'LOGIN' | 
    'NAVIGATE_MARGIN' | 
    'SELECT_ASSET' | 
    'ENTER_AMOUNT' | 
    'VERIFY_TERMS' | 
    'HANDLE_2FA' | 
    'EXECUTE_BORROW' | 
    'CAPTURE_CONFIRMATION'
  ];
  
  errorHandling: {
    maxRetries: 3;
    screenshotOnError: true;
    fallbackStrategies: ['RETRY', 'ALTERNATIVE_FLOW', 'MANUAL_ALERT'];
  };
}
```

---

## Risk Management Framework

### Risk Assessment Engine

```typescript
// /src/risk/risk-assessment.ts
class RiskAssessmentEngine {
  private config: RiskConfig;
  private marketData: MarketDataService;
  private historicalData: HistoricalDataService;
  
  async assessArbitrageRisk(signal: ArbitrageSignal): Promise<RiskScore> {
    const factors = await this.calculateRiskFactors(signal);
    
    return {
      overall: this.calculateOverallScore(factors),
      factors: {
        marketRisk: factors.marketVolatility * 0.3,
        executionRisk: factors.transferDelay * 0.2,
        liquidityRisk: factors.orderBookDepth * 0.2,
        counterpartyRisk: factors.exchangeReliability * 0.15,
        regulatoryRisk: factors.complianceScore * 0.15
      },
      recommendation: this.generateRecommendation(factors),
      maxAllowedPosition: this.calculateMaxPosition(factors)
    };
  }
  
  private calculateRiskFactors(signal: ArbitrageSignal): RiskFactors {
    return {
      marketVolatility: this.assessVolatility(signal.pair),
      transferDelay: this.estimateTransferTime(signal.type),
      orderBookDepth: this.analyzeOrderBook(signal.pair),
      exchangeReliability: this.getExchangeScore(),
      complianceScore: this.checkCompliance(signal)
    };
  }
}

// Risk monitoring dashboard
interface RiskMonitor {
  metrics: {
    currentExposure: number;
    dailyPnL: number;
    openPositions: number;
    marginUtilization: number;
    alertLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  };
  
  alerts: Alert[];
  actions: RiskAction[];
}
```

### Position Management

```typescript
// /src/risk/position-manager.ts
class PositionManager {
  private positions: Map<string, Position>;
  private limits: PositionLimits;
  
  async openPosition(params: PositionParams): Promise<Position> {
    // Validate against limits
    if (!this.validateLimits(params)) {
      throw new RiskLimitExceeded();
    }
    
    // Calculate position sizing
    const size = this.calculateOptimalSize(params);
    
    // Set stop loss and take profit
    const riskParams = this.setRiskParameters(params, size);
    
    // Create and track position
    const position = new Position({
      ...params,
      size,
      ...riskParams,
      openTime: new Date()
    });
    
    this.positions.set(position.id, position);
    
    return position;
  }
  
  async closePosition(positionId: string, reason: CloseReason): Promise<CloseResult> {
    const position = this.positions.get(positionId);
    if (!position) throw new PositionNotFound();
    
    // Execute closing trades
    const closeResult = await this.executeClose(position);
    
    // Calculate final P&L
    const pnl = this.calculatePnL(position, closeResult);
    
    // Update records
    position.status = 'CLOSED';
    position.closeTime = new Date();
    position.pnl = pnl;
    
    return { position, pnl, reason };
  }
}
```

---

## Configuration Management

### Configuration Structure

```typescript
// /src/config/config.ts
interface BotConfiguration {
  // Exchange configurations
  exchanges: {
    binance: BinanceConfig;
    bithumb: BithumbConfig;
  };
  
  // Trading parameters
  trading: {
    minPremiumThreshold: number;        // Default: 2.5%
    maxPositionSize: number;            // Default: 10 BTC
    maxSlippage: number;                // Default: 0.5%
    orderTimeoutMs: number;             // Default: 5000
    defaultPairs: string[];             // ['BTC/USDT', 'ETH/USDT']
  };
  
  // Risk management
  risk: {
    maxDailyLoss: number;               // Default: $10,000
    maxOpenPositions: number;           // Default: 3
    emergencyStopLoss: number;          // Default: 5%
    marginUtilizationLimit: number;     // Default: 80%
    interestRateThreshold: number;      // Default: 0.1% daily
  };
  
  // Transfer settings
  transfers: {
    confirmationBlocks: {
      BTC: 3,
      ETH: 12,
      USDT_ERC20: 12,
      USDT_TRC20: 19
    };
    maxTransferTime: number;            // Default: 30 minutes
    transferBuffer: number;              // Default: 10 minutes
  };
  
  // Monitoring
  monitoring: {
    telegram: TelegramConfig;
    logLevel: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
    metricsInterval: number;            // Default: 60 seconds
    healthCheckInterval: number;        // Default: 30 seconds
  };
  
  // Automation
  automation: {
    headless: boolean;                  // Default: true
    screenshotOnError: boolean;         // Default: true
    maxRetries: number;                 // Default: 3
    retryDelay: number;                 // Default: 5000ms
  };
}

// Environment-based configuration
class ConfigManager {
  private config: BotConfiguration;
  
  constructor() {
    this.loadConfiguration();
    this.validateConfiguration();
  }
  
  private loadConfiguration(): void {
    // Load from environment variables
    this.config = {
      exchanges: {
        binance: {
          apiKey: process.env.BINANCE_API_KEY!,
          apiSecret: process.env.BINANCE_API_SECRET!,
          testnet: process.env.NODE_ENV !== 'production'
        },
        bithumb: {
          apiKey: process.env.BITHUMB_API_KEY!,
          apiSecret: process.env.BITHUMB_API_SECRET!,
          loginCredentials: {
            username: process.env.BITHUMB_USERNAME!,
            password: process.env.BITHUMB_PASSWORD!,
            otpSecret: process.env.BITHUMB_OTP_SECRET
          }
        }
      },
      // ... other configurations
    };
  }
  
  private validateConfiguration(): void {
    // Validate required fields
    const requiredEnvVars = [
      'BINANCE_API_KEY',
      'BINANCE_API_SECRET',
      'BITHUMB_API_KEY',
      'BITHUMB_API_SECRET',
      'TELEGRAM_BOT_TOKEN',
      'TELEGRAM_CHAT_ID'
    ];
    
    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        throw new Error(`Missing required environment variable: ${envVar}`);
      }
    }
  }
}
```

### Configuration Files

```yaml
# /config/default.yaml
trading:
  minPremiumThreshold: 2.5
  maxPositionSize: 10
  maxSlippage: 0.5
  orderTimeoutMs: 5000
  defaultPairs:
    - BTC/USDT
    - ETH/USDT
    - XRP/USDT

risk:
  maxDailyLoss: 10000
  maxOpenPositions: 3
  emergencyStopLoss: 5
  marginUtilizationLimit: 80
  interestRateThreshold: 0.1

transfers:
  confirmationBlocks:
    BTC: 3
    ETH: 12
    USDT_ERC20: 12
    USDT_TRC20: 19
  maxTransferTime: 1800
  transferBuffer: 600

monitoring:
  logLevel: INFO
  metricsInterval: 60
  healthCheckInterval: 30
```

---

## Deployment & Operations

### Deployment Checklist

```markdown
## Pre-Deployment Checklist

### Environment Setup
- [ ] Node.js 18+ installed
- [ ] TypeScript 5.0+ configured
- [ ] PM2 or similar process manager installed
- [ ] SSL certificates configured
- [ ] Firewall rules configured

### API Credentials
- [ ] Binance API key/secret configured
- [ ] Binance API key has required permissions:
  - [ ] Spot trading enabled
  - [ ] Margin trading enabled
  - [ ] Withdrawal enabled (with whitelist)
- [ ] Bithumb API key/secret configured
- [ ] Bithumb account verified for margin trading
- [ ] Telegram bot token configured
- [ ] Telegram chat ID configured

### Configuration Validation
- [ ] All environment variables set
- [ ] Configuration files validated
- [ ] Risk limits reviewed and set
- [ ] Trading pairs configured
- [ ] Transfer addresses whitelisted

### Testing
- [ ] Unit tests passing (coverage > 80%)
- [ ] Integration tests passing
- [ ] Paper trading completed (minimum 48 hours)
- [ ] Emergency stop tested
- [ ] Recovery procedures tested

### Monitoring Setup
- [ ] Telegram notifications working
- [ ] Log aggregation configured
- [ ] Metrics dashboard accessible
- [ ] Health check endpoint responding
- [ ] Alert thresholds configured

### Operations
- [ ] Runbook documented
- [ ] Incident response plan ready
- [ ] Support contacts listed
- [ ] Maintenance windows defined
```

### Deployment Script

```bash
#!/bin/bash
# /scripts/deploy.sh

echo "Starting deployment of Arbitrage Bot..."

# Environment check
if [ "$NODE_ENV" != "production" ]; then
    echo "Warning: Not in production mode"
    read -p "Continue? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Build application
echo "Building TypeScript..."
npm run build

# Run tests
echo "Running tests..."
npm run test:unit
npm run test:integration

# Validate configuration
echo "Validating configuration..."
npm run validate:config

# Health check
echo "Running health check..."
npm run health:check

# Deploy with PM2
echo "Starting application with PM2..."
pm2 start ecosystem.config.js --env production

# Verify deployment
sleep 5
if pm2 list | grep -q "arbitrage-bot"; then
    echo "Deployment successful!"
    echo "Bot is running. Check logs: pm2 logs arbitrage-bot"
else
    echo "Deployment failed!"
    exit 1
fi
```

---

## Performance Monitoring

### Metrics Collection

```typescript
// /src/monitoring/metrics-collector.ts
interface SystemMetrics {
  // Performance metrics
  latency: {
    orderExecution: number;
    apiResponse: number;
    premiumCalculation: number;
  };
  
  // Trading metrics
  trading: {
    opportunitiesDetected: number;
    tradesExecuted: number;
    successRate: number;
    averageProfit: number;
    totalVolume: number;
  };
  
  // System health
  system: {
    cpuUsage: number;
    memoryUsage: number;
    diskUsage: number;
    networkLatency: Map<string, number>;
  };
  
  // Risk metrics
  risk: {
    currentExposure: number;
    marginUtilization: number;
    dailyVaR: number;
    sharpeRatio: number;
  };
}

class MetricsCollector {
  private metrics: SystemMetrics;
  private prometheusRegistry: Registry;
  
  async collectMetrics(): Promise<void> {
    // Collect performance metrics
    this.metrics.latency = await this.measureLatencies();
    
    // Collect trading metrics
    this.metrics.trading = await this.aggregateTradingMetrics();
    
    // Collect system metrics
    this.metrics.system = await this.getSystemMetrics();
    
    // Collect risk metrics
    this.metrics.risk = await this.calculateRiskMetrics();
    
    // Export to Prometheus
    this.exportToPrometheus();
    
    // Send to monitoring service
    await this.sendToMonitoring();
  }
  
  private async measureLatencies(): Promise<LatencyMetrics> {
    return {
      orderExecution: await this.measureOrderLatency(),
      apiResponse: await this.measureAPILatency(),
      premiumCalculation: await this.measureCalculationLatency()
    };
  }
}
```

### Telegram Monitoring Bot

```typescript
// /src/monitoring/telegram-monitor.ts
class TelegramMonitor {
  private bot: TelegramBot;
  private chatId: string;
  
  async sendTradeNotification(trade: ExecutedTrade): Promise<void> {
    const message = this.formatTradeMessage(trade);
    await this.bot.sendMessage(this.chatId, message, {
      parse_mode: 'Markdown'
    });
  }
  
  private formatTradeMessage(trade: ExecutedTrade): string {
    return `
🤖 *Trade Executed*
------------------------
Type: ${trade.type}
Pair: ${trade.pair}
Direction: ${trade.direction}
Amount: ${trade.amount}
Entry: $${trade.entryPrice}
Exit: $${trade.exitPrice}
Profit: $${trade.profit} (${trade.profitPercentage}%)
Duration: ${trade.duration}min
Status: ${trade.status === 'SUCCESS' ? '✅' : '❌'}
------------------------
Total P&L Today: $${this.getTodayPnL()}
    `;
  }
  
  async sendAlert(alert: Alert): Promise<void> {
    const emoji = this.getAlertEmoji(alert.severity);
    const message = `
${emoji} *Alert: ${alert.title}*
Severity: ${alert.severity}
Time: ${alert.timestamp}
Details: ${alert.message}
Action: ${alert.recommendedAction}
    `;
    
    await this.bot.sendMessage(this.chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: this.getAlertActions(alert)
    });
  }
}
```

---

## Appendix A: Data Models

```typescript
// Core data models
interface OrderBook {
  exchange: string;
  symbol: string;
  bids: Array<[price: number, amount: number]>;
  asks: Array<[price: number, amount: number]>;
  timestamp: Date;
}

interface Transfer {
  id: string;
  from: Exchange;
  to: Exchange;
  asset: string;
  amount: number;
  txHash: string;
  status: 'PENDING' | 'CONFIRMED' | 'FAILED';
  confirmations: number;
  estimatedTime: number;
  actualTime?: number;
}

interface Position {
  id: string;
  type: 'KIMCHI' | 'REVERSE';
  openTime: Date;
  closeTime?: Date;
  status: 'OPEN' | 'CLOSING' | 'CLOSED';
  entry: {
    exchange: string;
    price: number;
    amount: number;
    fees: number;
  };
  exit?: {
    exchange: string;
    price: number;
    amount: number;
    fees: number;
  };
  loans: Loan[];
  transfers: Transfer[];
  pnl?: number;
}

interface Loan {
  id: string;
  exchange: string;
  asset: string;
  amount: number;
  interestRate: number;
  borrowTime: Date;
  repayTime?: Date;
  status: 'ACTIVE' | 'REPAID';
  accruedInterest: number;
}
```

---

## Appendix B: API Response Examples

```json
// Binance Margin Borrow Response
{
  "tranId": 100000001,
  "status": "SUCCESS",
  "asset": "BTC",
  "amount": "1.00000000",
  "interestRate": "0.00010000",
  "timestamp": 1709500000000
}

// Bithumb Order Response
{
  "status": "0000",
  "order_id": "1234567890",
  "data": {
    "order_currency": "BTC",
    "payment_currency": "KRW",
    "order_price": "80000000",
    "order_qty": "1.00000000",
    "type": "ask",
    "status": "placed"
  }
}

// Transfer Status Response
{
  "id": "abc123",
  "status": "success",
  "txid": "0x123...",
  "confirmations": 3,
  "required_confirmations": 3,
  "amount": "1.0",
  "fee": "0.0005",
  "timestamp": 1709500000
}
```

---