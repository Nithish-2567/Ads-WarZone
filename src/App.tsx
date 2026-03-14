/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  LineChart,
  Line
} from 'recharts';
import Papa from 'papaparse';
import { format, startOfWeek, startOfMonth, parseISO, isValid, isWithinInterval } from 'date-fns';
import { 
  Upload, 
  Table as TableIcon, 
  BarChart3, 
  Calendar, 
  Search, 
  Filter,
  ChevronDown,
  Download,
  Info,
  Layers,
  Target,
  Type,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { AuctionInsightRow, PivotData, TimeGranularity } from './types';
import { GoogleGenAI } from '@google/genai';
import Markdown from 'react-markdown';

// Mock data generator for initial state/demo
const generateMockData = (): AuctionInsightRow[] => {
  const keywords = ['running shoes', 'gym wear', 'yoga mats'];
  const competitors = ['You', 'Competitor A', 'Competitor B', 'Competitor C'];
  const campaigns = ['Search_Brand', 'Search_Generic', 'Display_Remarketing'];
  const adGroups = ['AdGroup_1', 'AdGroup_2', 'AdGroup_3'];
  const matchTypes = ['Exact', 'Phrase', 'Broad'];
  
  const data: AuctionInsightRow[] = [];
  const now = new Date();
  
  for (let i = 0; i < 12; i++) { // 12 weeks
    const date = new Date(now);
    date.setDate(date.getDate() - (i * 7));
    
    keywords.forEach(kw => {
      competitors.forEach(comp => {
        data.push({
          date: new Date(date),
          keyword: kw,
          competitor: comp,
          impressionShare: Math.random() * 0.8 + 0.1,
          campaign: campaigns[Math.floor(Math.random() * campaigns.length)],
          adGroup: adGroups[Math.floor(Math.random() * adGroups.length)],
          matchType: matchTypes[Math.floor(Math.random() * matchTypes.length)]
        });
      });
    });
  }
  return data;
};

export default function App() {
  const [data, setData] = useState<AuctionInsightRow[]>([]);
  const [activeTab, setActiveTab] = useState<TimeGranularity>('week');
  const [activeView, setActiveView] = useState<'dashboard' | 'themes' | 'insights'>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedKeyword, setSelectedKeyword] = useState<string>('all');
  const [selectedCampaign, setSelectedCampaign] = useState<string>('all');
  const [selectedAdGroup, setSelectedAdGroup] = useState<string>('all');
  const [selectedMatchType, setSelectedMatchType] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [insights, setInsights] = useState<string>('');
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);

  // Load mock data on start if empty
  React.useEffect(() => {
    if (data.length === 0) {
      setData(generateMockData());
    }
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      parseFile(file);
    }
  };

  const parseFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      // Find the header row (usually contains 'Impression share' or 'Impr. share')
      const lines = text.split('\n');
      let headerIndex = 0;
      for (let i = 0; i < lines.length; i++) {
        const lowerLine = lines[i].toLowerCase();
        if (lowerLine.includes('impression share') || lowerLine.includes('impr. share')) {
          headerIndex = i;
          break;
        }
      }

      const csvData = lines.slice(headerIndex).join('\n');

      Papa.parse(csvData, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const parsedData: AuctionInsightRow[] = results.data
            .map((row: any) => {
              const getVal = (keys: string[]) => {
                const key = Object.keys(row).find(k => keys.includes(k.toLowerCase().trim()));
                return key ? String(row[key]) : '';
              };

              const dateStr = getVal(['day', 'date', 'week', 'month']);
              const keyword = getVal(['keyword', 'search keyword']) || 'Unknown';
              const competitor = getVal(['display url domain', 'competitor']) || 'Unknown';
              const campaign = getVal(['campaign']) || 'Unknown';
              const adGroup = getVal(['ad group']) || 'Unknown';
              const matchType = getVal(['match type']) || 'Unknown';
              const isStr = getVal(['impression share', 'impr. share']) || '0%';
              
              let date = new Date(NaN);
              if (dateStr) {
                date = new Date(dateStr);
                if (!isValid(date)) {
                  date = parseISO(dateStr);
                }
              }
              
              let impressionShare = 0;
              if (isStr.includes('<')) {
                impressionShare = 0.05;
              } else {
                impressionShare = parseFloat(isStr.replace(/%/g, '').replace(/,/g, '')) / 100 || 0;
              }

              if (isValid(date)) {
                return { 
                  date, 
                  keyword, 
                  competitor, 
                  impressionShare,
                  campaign,
                  adGroup,
                  matchType
                };
              }
              return null;
            })
            .filter((row): row is AuctionInsightRow => row !== null);
          
          if (parsedData.length > 0) {
            setData(parsedData);
          } else {
            console.error("No valid data found in the CSV. Please ensure it contains Date and Impression Share columns.");
          }
        }
      });
    };
    reader.readAsText(file);
  };

  const filteredData = useMemo(() => {
    return data.filter(d => {
      const matchesKeyword = selectedKeyword === 'all' || d.keyword === selectedKeyword;
      const matchesCampaign = selectedCampaign === 'all' || d.campaign === selectedCampaign;
      const matchesAdGroup = selectedAdGroup === 'all' || d.adGroup === selectedAdGroup;
      const matchesMatchType = selectedMatchType === 'all' || d.matchType === selectedMatchType;
      const matchesSearch = !searchQuery || d.competitor.toLowerCase().includes(searchQuery.toLowerCase());
      
      let matchesDate = true;
      if (startDate || endDate) {
        const start = startDate ? new Date(startDate) : new Date(0);
        const end = endDate ? new Date(endDate) : new Date(8640000000000000);
        matchesDate = isWithinInterval(d.date, { start, end });
      }

      return matchesKeyword && matchesCampaign && matchesAdGroup && matchesMatchType && matchesSearch && matchesDate;
    });
  }, [data, selectedKeyword, selectedCampaign, selectedAdGroup, selectedMatchType, searchQuery, startDate, endDate]);

  const pivotData = useMemo(() => {
    const timeGetter = activeTab === 'week' ? startOfWeek : startOfMonth;
    const timeFormat = activeTab === 'week' ? 'MMM dd' : 'MMM yyyy';
    
    // Sort unique dates first, then format them
    const uniqueDates: number[] = Array.from(new Set(
      filteredData.map(d => timeGetter(d.date).getTime())
    )).map(val => Number(val)).sort((a, b) => a - b);

    const timeKeys = uniqueDates.map(t => format(new Date(t), timeFormat));

    const grouped: { [key: string]: PivotData } = {};

    filteredData.forEach(d => {
      const key = `${d.campaign}|${d.adGroup}|${d.keyword}|${d.competitor}`;
      const timeKey = format(timeGetter(d.date), timeFormat);

      if (!grouped[key]) {
        grouped[key] = {
          key,
          campaign: d.campaign,
          adGroup: d.adGroup,
          keyword: d.keyword,
          competitor: d.competitor,
          values: {}
        };
      }
      grouped[key].values[timeKey] = d.impressionShare;
    });

    return {
      rows: Object.values(grouped),
      timeKeys
    };
  }, [filteredData, activeTab]);

  const themeShareData = useMemo(() => {
    const allThemes = Array.from(new Set(filteredData.map(d => d.keyword)));
    const totalThemesCount = allThemes.length;
    
    const competitorThemes: { [competitor: string]: Set<string> } = {};
    
    filteredData.forEach(d => {
      if (!competitorThemes[d.competitor]) {
        competitorThemes[d.competitor] = new Set();
      }
      competitorThemes[d.competitor].add(d.keyword);
    });

    return Object.entries(competitorThemes)
      .filter(([competitor]) => competitor.toLowerCase() !== 'you')
      .map(([competitor, themes]) => ({
        competitor,
        count: themes.size,
        total: totalThemesCount,
        percentage: (themes.size / totalThemesCount) * 100
      }))
      .sort((a, b) => b.count - a.count);
  }, [filteredData]);

  const totalThemesCount = useMemo(() => {
    return new Set(filteredData.map(d => d.keyword)).size;
  }, [filteredData]);

  const filterOptions = useMemo(() => {
    return {
      keywords: ['all', ...Array.from(new Set(data.map(d => d.keyword)))],
      campaigns: ['all', ...Array.from(new Set(data.map(d => d.campaign)))],
      adGroups: ['all', ...Array.from(new Set(data.map(d => d.adGroup)))],
      matchTypes: ['all', ...Array.from(new Set(data.map(d => d.matchType)))]
    };
  }, [data]);

  const chartData = useMemo(() => {
    const { timeKeys, rows } = pivotData;
    return timeKeys.map(tk => {
      const point: any = { name: tk };
      rows.forEach(r => {
        if (r.values[tk]) {
          point[r.competitor] = (r.values[tk] * 100).toFixed(1);
        }
      });
      return point;
    });
  }, [pivotData]);

  const competitors = useMemo(() => Array.from(new Set(filteredData.map(d => d.competitor))), [filteredData]);

const generateInsights = async () => {
    setIsGeneratingInsights(true);
    try {
      // 1. We no longer need an import or the API key locally.
      // 2. We send the data to our secure server-side route.
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // We pass the data to the API route to handle the prompt construction
          data: {
            totalThemesCount,
            competitors,
            themeShareData,
            pivotDataRows: pivotData.rows.slice(0, 50)
          }
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch insights from the server.');
      }

      const data = await response.json();
      setInsights(data.text || "No insights generated.");
    } catch (error) {
      console.error("Error generating insights:", error);
      setInsights("Failed to generate insights. Please check your server connection.");
    } finally {
      setIsGeneratingInsights(false);
    }
  };
      const ai = new GoogleGenAI({ apiKey });
      
      const prompt = `
        You are an expert Google Ads analyst. Analyze the following Auction Insights data and provide actionable insights about each competitor based on their impression share and theme coverage.
        
        Data Summary:
        - Total Themes: ${totalThemesCount}
        - Competitors: ${competitors.join(', ')}
        
        Theme Share Data:
        ${JSON.stringify(themeShareData, null, 2)}
        
        Impression Share Data (Pivot):
        ${JSON.stringify(pivotData.rows.slice(0, 50), null, 2)} // Limit to avoid huge prompt
        
        Provide a concise, professional analysis. Focus on:
        1. Who are the most aggressive competitors?
        2. Are there any emerging threats?
        3. What are the key areas of overlap?
        4. Recommendations for our own strategy.
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: prompt,
      });

      setInsights(response.text || "No insights generated.");
    } catch (error) {
      console.error("Error generating insights:", error);
      setInsights("Failed to generate insights. Please check your API key and try again.");
    } finally {
      setIsGeneratingInsights(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans">
      {/* Header */}
      <header className="bg-white border-b border-[#E0E0E0] sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-lg">
              <BarChart3 className="text-white w-6 h-6" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">Auction Insights Pro</h1>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex bg-[#F1F3F4] p-1 rounded-lg mr-4">
              <button 
                onClick={() => setActiveView('dashboard')}
                className={cn(
                  "px-4 py-1.5 text-sm font-medium rounded-md transition-all",
                  activeView === 'dashboard' ? "bg-white shadow-sm text-indigo-600" : "text-[#5F6368] hover:text-[#1A1A1A]"
                )}
              >
                Dashboard
              </button>
              <button 
                onClick={() => setActiveView('themes')}
                className={cn(
                  "px-4 py-1.5 text-sm font-medium rounded-md transition-all",
                  activeView === 'themes' ? "bg-white shadow-sm text-indigo-600" : "text-[#5F6368] hover:text-[#1A1A1A]"
                )}
              >
                Theme Share
              </button>
              <button 
                onClick={() => setActiveView('insights')}
                className={cn(
                  "px-4 py-1.5 text-sm font-medium rounded-md transition-all flex items-center gap-1",
                  activeView === 'insights' ? "bg-white shadow-sm text-indigo-600" : "text-[#5F6368] hover:text-[#1A1A1A]"
                )}
              >
                <Sparkles className="w-4 h-4" />
                AI Insights
              </button>
            </div>
            <label className="cursor-pointer bg-white border border-[#D1D1D1] hover:bg-[#F1F3F4] px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2">
              <Upload className="w-4 h-4" />
              Upload CSV
              <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
            </label>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Controls Grid */}
        <div className="bg-white rounded-xl shadow-sm border border-[#E0E0E0] p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-[#5F6368] uppercase tracking-wider">Search Competitor</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5F6368]" />
                <input 
                  type="text" 
                  placeholder="Filter by domain..."
                  className="w-full pl-10 pr-4 py-2 bg-[#F1F3F4] border-transparent focus:bg-white focus:ring-2 focus:ring-indigo-500 rounded-lg text-sm transition-all"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-[#5F6368] uppercase tracking-wider">Campaign</label>
              <div className="relative">
                <Target className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5F6368]" />
                <select 
                  className="w-full pl-10 pr-4 py-2 bg-[#F1F3F4] border-transparent focus:bg-white focus:ring-2 focus:ring-indigo-500 rounded-lg text-sm appearance-none cursor-pointer transition-all"
                  value={selectedCampaign}
                  onChange={(e) => setSelectedCampaign(e.target.value)}
                >
                  {filterOptions.campaigns.map(c => (
                    <option key={c} value={c}>{c === 'all' ? 'All Campaigns' : c}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5F6368] pointer-events-none" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-[#5F6368] uppercase tracking-wider">Ad Group</label>
              <div className="relative">
                <Layers className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5F6368]" />
                <select 
                  className="w-full pl-10 pr-4 py-2 bg-[#F1F3F4] border-transparent focus:bg-white focus:ring-2 focus:ring-indigo-500 rounded-lg text-sm appearance-none cursor-pointer transition-all"
                  value={selectedAdGroup}
                  onChange={(e) => setSelectedAdGroup(e.target.value)}
                >
                  {filterOptions.adGroups.map(ag => (
                    <option key={ag} value={ag}>{ag === 'all' ? 'All Ad Groups' : ag}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5F6368] pointer-events-none" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-[#5F6368] uppercase tracking-wider">Keyword</label>
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5F6368]" />
                <select 
                  className="w-full pl-10 pr-4 py-2 bg-[#F1F3F4] border-transparent focus:bg-white focus:ring-2 focus:ring-indigo-500 rounded-lg text-sm appearance-none cursor-pointer transition-all"
                  value={selectedKeyword}
                  onChange={(e) => setSelectedKeyword(e.target.value)}
                >
                  {filterOptions.keywords.map(kw => (
                    <option key={kw} value={kw}>{kw === 'all' ? 'All Keywords' : kw}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5F6368] pointer-events-none" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-[#5F6368] uppercase tracking-wider">Match Type</label>
              <div className="relative">
                <Type className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5F6368]" />
                <select 
                  className="w-full pl-10 pr-4 py-2 bg-[#F1F3F4] border-transparent focus:bg-white focus:ring-2 focus:ring-indigo-500 rounded-lg text-sm appearance-none cursor-pointer transition-all"
                  value={selectedMatchType}
                  onChange={(e) => setSelectedMatchType(e.target.value)}
                >
                  {filterOptions.matchTypes.map(mt => (
                    <option key={mt} value={mt}>{mt === 'all' ? 'All Match Types' : mt}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5F6368] pointer-events-none" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-[#5F6368] uppercase tracking-wider">Date Range</label>
              <div className="flex items-center gap-2">
                <input 
                  type="date" 
                  className="flex-1 px-3 py-2 bg-[#F1F3F4] border-transparent focus:bg-white focus:ring-2 focus:ring-indigo-500 rounded-lg text-sm transition-all"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
                <span className="text-[#5F6368]">to</span>
                <input 
                  type="date" 
                  className="flex-1 px-3 py-2 bg-[#F1F3F4] border-transparent focus:bg-white focus:ring-2 focus:ring-indigo-500 rounded-lg text-sm transition-all"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-[#5F6368] uppercase tracking-wider">Time Granularity</label>
              <div className="flex bg-[#F1F3F4] p-1 rounded-lg">
                <button 
                  onClick={() => setActiveTab('week')}
                  className={cn(
                    "flex-1 py-1.5 text-sm font-medium rounded-md transition-all flex items-center justify-center gap-2",
                    activeTab === 'week' ? "bg-white shadow-sm text-indigo-600" : "text-[#5F6368] hover:text-[#1A1A1A]"
                  )}
                >
                  <Calendar className="w-4 h-4" />
                  Weekly
                </button>
                <button 
                  onClick={() => setActiveTab('month')}
                  className={cn(
                    "flex-1 py-1.5 text-sm font-medium rounded-md transition-all flex items-center justify-center gap-2",
                    activeTab === 'month' ? "bg-white shadow-sm text-indigo-600" : "text-[#5F6368] hover:text-[#1A1A1A]"
                  )}
                >
                  <Calendar className="w-4 h-4" />
                  Monthly
                </button>
              </div>
            </div>
          </div>
        </div>

        {activeView === 'dashboard' ? (
          <>
            {/* Chart Section */}
            <div className="bg-white rounded-xl shadow-sm border border-[#E0E0E0] p-6 mb-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-indigo-600" />
                  Impression Share Trends ({activeTab === 'week' ? 'Weekly' : 'Monthly'})
                </h2>
              </div>
              <div className="h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F3F4" />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{fill: '#5F6368', fontSize: 12}}
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{fill: '#5F6368', fontSize: 12}}
                      tickFormatter={(val) => `${val}%`}
                    />
                    <Tooltip 
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                      formatter={(value: any) => [`${value}%`, 'Impression Share']}
                    />
                    <Legend iconType="circle" />
                    {competitors.slice(0, 6).map((comp, idx) => (
                      <Line 
                        key={comp}
                        type="monotone" 
                        dataKey={comp} 
                        stroke={[
                          '#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'
                        ][idx % 6]} 
                        strokeWidth={2}
                        dot={{ r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Table Section */}
            <div className="bg-white rounded-xl shadow-sm border border-[#E0E0E0] overflow-hidden">
              <div className="p-6 border-b border-[#E0E0E0] flex items-center justify-between">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <TableIcon className="w-5 h-5 text-indigo-600" />
                  {activeTab === 'week' ? 'Weekly' : 'Monthly'} Breakdown
                </h2>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-[#5F6368]">
                    Showing {pivotData.rows.length} rows
                  </span>
                  <button className="text-sm text-indigo-600 font-medium hover:underline flex items-center gap-1">
                    <Download className="w-4 h-4" />
                    Export
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#F8F9FA]">
                      <th className="px-6 py-4 text-xs font-semibold text-[#5F6368] uppercase tracking-wider border-b border-[#E0E0E0] sticky left-0 bg-[#F8F9FA] z-10 min-w-[150px]">
                        Campaign
                      </th>
                      <th className="px-6 py-4 text-xs font-semibold text-[#5F6368] uppercase tracking-wider border-b border-[#E0E0E0] min-w-[150px]">
                        Ad Group
                      </th>
                      <th className="px-6 py-4 text-xs font-semibold text-[#5F6368] uppercase tracking-wider border-b border-[#E0E0E0] min-w-[150px]">
                        Keyword
                      </th>
                      <th className="px-6 py-4 text-xs font-semibold text-[#5F6368] uppercase tracking-wider border-b border-[#E0E0E0] min-w-[150px]">
                        Competitor
                      </th>
                      {pivotData.timeKeys.map(tk => (
                        <th key={tk} className="px-6 py-4 text-xs font-semibold text-[#5F6368] uppercase tracking-wider border-b border-[#E0E0E0] text-center min-w-[120px]">
                          {tk}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence mode="popLayout">
                      {pivotData.rows.map((row, idx) => (
                        <motion.tr 
                          key={row.key}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ delay: idx * 0.01 }}
                          className="hover:bg-[#F1F3F4] transition-colors group"
                        >
                          <td className="px-6 py-4 border-b border-[#E0E0E0] sticky left-0 bg-white group-hover:bg-[#F1F3F4] z-10">
                            <span className="text-sm font-medium text-[#1A1A1A]">{row.campaign}</span>
                          </td>
                          <td className="px-6 py-4 border-b border-[#E0E0E0]">
                            <span className="text-sm text-[#5F6368]">{row.adGroup}</span>
                          </td>
                          <td className="px-6 py-4 border-b border-[#E0E0E0]">
                            <span className="text-sm text-[#5F6368]">{row.keyword}</span>
                          </td>
                          <td className="px-6 py-4 border-b border-[#E0E0E0]">
                            <span className="text-sm font-semibold text-[#1A1A1A]">{row.competitor}</span>
                          </td>
                          {pivotData.timeKeys.map(tk => (
                            <td key={tk} className="px-6 py-4 border-b border-[#E0E0E0] text-center">
                              {row.values[tk] ? (
                                <div className="flex flex-col items-center gap-1">
                                  <span className="text-sm font-semibold">
                                    {(row.values[tk] * 100).toFixed(1)}%
                                  </span>
                                  <div className="w-16 h-1 bg-[#E0E0E0] rounded-full overflow-hidden">
                                    <div 
                                      className="h-full bg-indigo-500 rounded-full" 
                                      style={{ width: `${row.values[tk] * 100}%` }}
                                    />
                                  </div>
                                </div>
                              ) : (
                                <span className="text-[#D1D1D1]">—</span>
                              )}
                            </td>
                          ))}
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
              {pivotData.rows.length === 0 && (
                <div className="py-20 flex flex-col items-center justify-center text-[#5F6368]">
                  <Search className="w-12 h-12 mb-4 opacity-20" />
                  <p className="text-lg font-medium">No data found matching your filters</p>
                  <p className="text-sm">Try adjusting your search or filters</p>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Theme Share Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white p-6 rounded-xl shadow-sm border border-[#E0E0E0]"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-indigo-50 rounded-lg">
                    <Type className="w-5 h-5 text-indigo-600" />
                  </div>
                  <p className="text-xs font-semibold text-[#5F6368] uppercase tracking-wider">Total Themes</p>
                </div>
                <p className="text-3xl font-bold text-[#1A1A1A]">{totalThemesCount}</p>
                <p className="text-xs text-[#5F6368] mt-1">Unique keywords in selection</p>
              </motion.div>

              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-white p-6 rounded-xl shadow-sm border border-[#E0E0E0]"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-emerald-50 rounded-lg">
                    <Target className="w-5 h-5 text-emerald-600" />
                  </div>
                  <p className="text-xs font-semibold text-[#5F6368] uppercase tracking-wider">Top Competitor</p>
                </div>
                <p className="text-3xl font-bold text-[#1A1A1A]">{themeShareData[0]?.competitor || 'N/A'}</p>
                <p className="text-xs text-[#5F6368] mt-1">
                  {themeShareData[0] ? `${themeShareData[0].count} shared themes` : 'No competitors found'}
                </p>
              </motion.div>

              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-white p-6 rounded-xl shadow-sm border border-[#E0E0E0]"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-amber-50 rounded-lg">
                    <BarChart3 className="w-5 h-5 text-amber-600" />
                  </div>
                  <p className="text-xs font-semibold text-[#5F6368] uppercase tracking-wider">Avg. Theme Overlap</p>
                </div>
                <p className="text-3xl font-bold text-[#1A1A1A]">
                  {themeShareData.length > 0 
                    ? (themeShareData.reduce((acc, curr) => acc + curr.percentage, 0) / themeShareData.length).toFixed(1) 
                    : 0}%
                </p>
                <p className="text-xs text-[#5F6368] mt-1">Across all competitors</p>
              </motion.div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Theme Share Chart */}
            <div className="bg-white rounded-xl shadow-sm border border-[#E0E0E0] p-6">
              <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
                <Target className="w-5 h-5 text-indigo-600" />
                Competitor Theme Coverage
              </h2>
              <div className="h-[500px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={themeShareData} layout="vertical" margin={{ left: 40, right: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F3F4" />
                    <XAxis type="number" domain={[0, 100]} tickFormatter={(val) => `${val}%`} hide />
                    <YAxis 
                      dataKey="competitor" 
                      type="category" 
                      axisLine={false} 
                      tickLine={false} 
                      width={120}
                      tick={{fill: '#1A1A1A', fontSize: 12, fontWeight: 500}}
                    />
                    <Tooltip 
                      cursor={{fill: '#F1F3F4'}}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                      formatter={(value: any, name: any, props: any) => [
                        `${props.payload.count} of ${props.payload.total} themes (${value.toFixed(1)}%)`,
                        'Coverage'
                      ]}
                    />
                    <Bar 
                      dataKey="percentage" 
                      fill="#4F46E5" 
                      radius={[0, 4, 4, 0]} 
                      barSize={24}
                      label={{ 
                        position: 'right', 
                        formatter: (val: number) => `${val.toFixed(1)}%`,
                        fill: '#5F6368',
                        fontSize: 12,
                        fontWeight: 600
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Theme Share List */}
            <div className="bg-white rounded-xl shadow-sm border border-[#E0E0E0] p-6">
              <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
                <TableIcon className="w-5 h-5 text-indigo-600" />
                Theme Coverage Details
              </h2>
              <div className="space-y-4">
                {themeShareData.map((item, idx) => (
                  <motion.div 
                    key={item.competitor}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="p-4 rounded-lg bg-[#F8F9FA] border border-[#E0E0E0] flex items-center justify-between"
                  >
                    <div>
                      <h3 className="font-semibold text-[#1A1A1A]">{item.competitor}</h3>
                      <p className="text-xs text-[#5F6368]">
                        Appears in <span className="font-bold text-indigo-600">{item.count}</span> unique themes
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold text-indigo-600">
                        {item.percentage.toFixed(0)}%
                      </div>
                      <div className="text-[10px] text-[#5F6368] uppercase font-semibold">
                        Overall Coverage
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {activeView === 'insights' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="space-y-8"
        >
          <div className="bg-white rounded-xl shadow-sm border border-[#E0E0E0] p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold flex items-center gap-3 text-[#1A1A1A]">
                <Sparkles className="w-6 h-6 text-indigo-600" />
                Gemini Intelligence
              </h2>
              <button
                onClick={generateInsights}
                disabled={isGeneratingInsights || filteredData.length === 0}
                className={cn(
                  "px-6 py-2.5 rounded-lg font-semibold flex items-center gap-2 transition-all",
                  isGeneratingInsights || filteredData.length === 0
                    ? "bg-[#E0E0E0] text-[#5F6368] cursor-not-allowed"
                    : "bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm hover:shadow-md"
                )}
              >
                {isGeneratingInsights ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Analyzing Data...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate Insights
                  </>
                )}
              </button>
            </div>

            {insights ? (
              <div className="prose prose-indigo max-w-none prose-headings:font-semibold prose-a:text-indigo-600">
                <Markdown>{insights}</Markdown>
              </div>
            ) : (
              <div className="text-center py-16 bg-[#F8F9FA] rounded-xl border border-dashed border-[#D1D1D1]">
                <Sparkles className="w-12 h-12 text-[#D1D1D1] mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-[#1A1A1A] mb-2">Ready to Analyze</h3>
                <p className="text-[#5F6368] max-w-md mx-auto">
                  Click the button above to generate AI-powered insights about your competitors based on the current filters.
                </p>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center">
        <p className="text-sm text-[#5F6368]">
          Built for high-performance auction analysis. &copy; 2026 Auction Insights Pro.
        </p>
      </footer>
    </div>
  );
}
