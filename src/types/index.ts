export interface Market {
  id: string;
  question: string;
  groupItemTitle: string;
  groupItemThreshold: number;
  endDate: number; // Unix timestamp (seconds)
  startDate: number; // Unix timestamp (seconds)
  clobTokenIds: string; // JSON-encoded string
  outcomePrices: string; // JSON-encoded string e.g. '["0.85","0.15"]'
}

export interface PolymarketEvent {
  id: string;
  slug: string;
  title: string;
  description: string;
  startDate: number; // Unix timestamp (seconds)
  endDate: number; // Unix timestamp (seconds)
  markets: Market[];
  series?: {
    cgAssetName?: string;
    seriesSlug?: string;
  };
}

export interface PricePoint {
  t: number; // Unix timestamp
  p: number; // Price
}

export interface PriceHistory {
  history: PricePoint[];
}

export interface ParsedMarket {
  id: string;
  question: string;
  groupItemTitle: string;
  groupItemThreshold: number;
  endDate: number; // Unix timestamp (seconds)
  startDate: number; // Unix timestamp (seconds)
  yesTokenId: string;
  noTokenId: string;
  currentPrice: number; // YES outcome price (0-1)
  strikePrice: number; // Parsed strike price from groupItemTitle
}

export type CryptoOption = 'BTC' | 'ETH' | 'SOL' | 'XRP';

export type OptionType = 'above' | 'hit';

export interface ProjectionPoint {
  cryptoPrice: number;
  constructionCost: number;
}

export interface ProjectionCurve {
  label: string;
  data: ProjectionPoint[];
  color: string;
}

export interface SelectedStrike {
  marketId: string;
  question: string;
  groupItemTitle: string;
  strikePrice: number;
  currentPrice: number; // YES price
  impliedVol: number; // Calibrated IV
}
