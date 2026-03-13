export interface AuctionInsightRow {
  date: Date;
  keyword: string;
  competitor: string;
  impressionShare: number;
  adGroup: string;
  campaign: string;
  matchType: string;
}

export interface PivotData {
  key: string;
  campaign: string;
  adGroup: string;
  keyword: string;
  competitor: string;
  values: { [timeKey: string]: number };
}

export type TimeGranularity = 'week' | 'month';
