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
  Sparkles,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { AuctionInsightRow, PivotData, TimeGranularity } from './types';
import { GoogleGenAI } from '@google/genai';
import Markdown from 'react-markdown';
import { MultiSelect } from './components/MultiSelect';

// Mock data generator for initial state/demo
const generateMockData = (): AuctionInsightRow[] => {
  const keywords = ['running shoes', 'gym wear', 'yoga mats', 'fitness trackers', 'protein powder'];
  const competitors = ['You', 'Competitor A', 'Competitor B', 'Competitor C', 'Competitor D'];
  const campaigns = ['Search_Brand', 'Search_Generic', 'Display_Remarketing', 'Video_Awareness'];
  const adGroups = ['AdGroup_1', 'AdGroup_2', 'AdGroup_3', 'AdGroup_4'];
  const matchTypes = ['Exact', 'Phrase', 'Broad'];
  
  const data: AuctionInsightRow[] = [];
  const now = new Date();
  
  // Last 180 days (approx 6 months)
  for (let i = 0; i < 180; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    
    // Randomly pick a few keywords for each day to simulate real data
    const dayKeywords = keywords.filter(() => Math.random() > 0.5);
    
    dayKeywords.forEach(kw => {
      competitors.forEach(comp => {
        // Not every competitor appears for every keyword every day
        if (Math.random() > 0.3) {
          data.push({
            date: new Date(date),
            keyword: kw,
            competitor: comp,
            impressionShare: Math.random() * 0.8 + 0.1,
            campaign: campaigns[Math.floor(Math.random() * campaigns.length)],
            adGroup: adGroups[Math.floor(Math.random() * adGroups.length)],
            matchType: matchTypes[Math.floor(Math.random() * matchTypes.length)]
          });
        }
      });
    });
  }
  return data;
};

export default function App() {
  const [data, setData] = useState<AuctionInsightRow[]>([]);
  const [activeTab, setActiveTab] = useState<TimeGranularity>('week');
  const [activeView, setActiveView] = useState<'dashboard' | 'themes' | 'insights'>('dashboard');
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  const [selectedCampaigns, setSelectedCampaigns] = useState<string[]>([]);
  const [selectedAdGroups, setSelectedAdGroups] = useState<string[]>([]);
  const [selectedMatchTypes, setSelectedMatchTypes] = useState<string[]>([]);
  const [selectedCompetitors, setSelectedCompetitors] = useState<string[]>([]);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [insights, setInsights] = useState<string>('');
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedThemeInShare, setSelectedThemeInShare] = useState<string | null>(null);
  const [selectedCompInShare, setSelectedCompInShare] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  // Load mock data on start if empty - REMOVED for "Universal Upload" focus
  // React.useEffect(() => {
  //   if (data.length === 0) {
  //     setData(generateMockData());
  //   }
  // }, []);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (key: string) => {
    if (!sortConfig || sortConfig.key !== key) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
    return sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />;
  };

  const clearAllFilters = () => {
    setSelectedKeywords([]);
    setSelectedCampaigns([]);
    setSelectedAdGroups([]);
    setSelectedMatchTypes([]);
    setSelectedCompetitors([]);
    setStartDate('');
    setEndDate('');
  };

  const generateSampleData = () => {
    setData(generateMockData());
    setError(null);
    clearAllFilters();
  };

  const randomizeCurrentData = () => {
    if (data.length === 0) {
      setData(generateMockData());
      return;
    }
    const randomized = data.map(row => ({
      ...row,
      impressionShare: Math.random() * 0.8 + 0.1
    }));
    setData(randomized);
  };

  const parseImpressionShare = (val: string): number => {
    if (!val) return 0;
    
    const cleanVal = val.trim().toLowerCase();
    
    // Handle null/empty indicators
    if (cleanVal === '--' || cleanVal === '-' || cleanVal === '' || cleanVal === 'null' || cleanVal === 'n/a') {
      return 0;
    }
    
    // Handle comparison operators
    if (cleanVal.includes('<')) {
      const num = parseFloat(cleanVal.replace(/[<%]/g, ''));
      // For <10%, we'll treat it as the value itself (0.1) but it's technically "less than"
      // Google Ads uses <10% to mean any value from 0 to 10%.
      return isNaN(num) ? 0.05 : num / 100;
    }
    
    if (cleanVal.includes('>')) {
      const num = parseFloat(cleanVal.replace(/[>%]/g, ''));
      return isNaN(num) ? 0.95 : num / 100;
    }
    
    const num = parseFloat(cleanVal.replace(/%/g, '').replace(/,/g, ''));
    if (isNaN(num)) return 0;
    
    // If it's a percentage (e.g. "85.5" or "85.5%"), it will be > 1 usually
    // If it's a decimal (e.g. "0.855"), it will be <= 1
    if (cleanVal.includes('%') || num > 1) {
      return num / 100;
    }
    
    return num;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      parseFile(file);
      // Reset input value to allow uploading the same file again
      e.target.value = '';
    }
  };

  const parseFile = (file: File) => {
    setError(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      // Find the header row more aggressively
      const lines = text.split('\n');
      let headerIndex = -1;
      
      const headerKeywords = [
        'impression share', 'impr. share', 'search impr. share', 
        'display url domain', 'competitor', 'keyword', 'day', 'date'
      ];

      for (let i = 0; i < Math.min(lines.length, 50); i++) {
        const lowerLine = lines[i].toLowerCase();
        if (headerKeywords.some(kw => lowerLine.includes(kw))) {
          headerIndex = i;
          break;
        }
      }

      // Fallback to 0 if no header keywords found, but usually Ads CSVs have metadata at top
      if (headerIndex === -1) headerIndex = 0;

      const csvData = lines.slice(headerIndex).join('\n');

      Papa.parse(csvData, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.data.length > 0) {
            console.log("First row keys:", Object.keys(results.data[0]));
          }

          const parsedData: AuctionInsightRow[] = results.data
            .map((row: any, index: number) => {
              const getVal = (keys: string[]) => {
                const rowKeys = Object.keys(row);
                // First try exact match (case insensitive, trimmed)
                const exactMatch = rowKeys.find(k => 
                  keys.some(target => k.toLowerCase().trim() === target.toLowerCase().trim())
                );
                if (exactMatch) return String(row[exactMatch]);

                // Then try fuzzy match (remove non-alphanumeric)
                const foundKey = rowKeys.find(k => {
                  const cleanK = k.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
                  return keys.some(target => {
                    const cleanTarget = target.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
                    return cleanK === cleanTarget || cleanK.includes(cleanTarget) || cleanTarget.includes(cleanK);
                  });
                });
                return foundKey ? String(row[foundKey]) : '';
              };

              // Expand aliases for better detection
              const dateStr = getVal(['day', 'date', 'week', 'month', 'time', 'period', 'startdate', 'start date']);
              const keyword = getVal(['keyword', 'searchkeyword', 'search keyword', 'item', 'theme', 'category']) || 'Unknown';
              const competitor = getVal(['displayurldomain', 'display url domain', 'competitor', 'domain', 'advertiser', 'advertiser name']) || 'Unknown';
              const campaign = getVal(['campaign', 'campaignname', 'campaign name']) || 'Unknown';
              const adGroup = getVal(['adgroup', 'ad group', 'adgroupname', 'ad group name']) || 'Unknown';
              const matchType = getVal(['matchtype', 'match type']) || 'Unknown';
              const isStr = getVal(['impressionshare', 'impression share', 'imprshare', 'impr share', 'searchimpressionshare', 'search impression share', 'searchimprshare', 'search impr share']);
              
              if (index === 0) {
                console.log("Detected values for first row:", { dateStr, keyword, competitor, isStr });
              }

              // Skip "Total" rows
              if (competitor.toLowerCase().includes('total') || keyword.toLowerCase().includes('total')) {
                return null;
              }

              let date = new Date(NaN);
              if (dateStr) {
                // Try standard parsing
                date = new Date(dateStr);
                
                // Try ISO parsing
                if (!isValid(date)) {
                  date = parseISO(dateStr);
                }

                // Try common DD/MM/YYYY or MM/DD/YYYY if still invalid
                if (!isValid(date) && dateStr.includes('/')) {
                  const parts = dateStr.split(/[\/\s-]/);
                  if (parts.length >= 3) {
                    const p0 = parseInt(parts[0]);
                    const p1 = parseInt(parts[1]);
                    const p2 = parseInt(parts[2]);

                    // Try YYYY-MM-DD
                    if (parts[0].length === 4) date = new Date(p0, p1 - 1, p2);
                    // Try DD/MM/YYYY (common in non-US)
                    else if (p0 > 12) date = new Date(p2 < 100 ? 2000 + p2 : p2, p1 - 1, p0);
                    // Try MM/DD/YYYY
                    else date = new Date(p2 < 100 ? 2000 + p2 : p2, p0 - 1, p1);
                  }
                }
              }
              
              const impressionShare = parseImpressionShare(isStr);

              if (isValid(date) && competitor !== 'Unknown' && isStr !== '') {
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
            setError(null);
            // Reset filters when new data is loaded
            setSelectedKeywords([]);
            setSelectedCampaigns([]);
            setSelectedAdGroups([]);
            setSelectedMatchTypes([]);
            setSelectedCompetitors([]);
            setStartDate('');
            setEndDate('');
            setInsights('');
          } else {
            setError("No valid auction data found. Please ensure your CSV contains 'Date' and 'Impression Share' columns.");
          }
        }
      });
    };
    reader.readAsText(file);
  };

  const filteredData = useMemo(() => {
    return data.filter(d => {
      const matchesKeyword = selectedKeywords.length === 0 || selectedKeywords.includes(d.keyword);
      const matchesCampaign = selectedCampaigns.length === 0 || selectedCampaigns.includes(d.campaign);
      const matchesAdGroup = selectedAdGroups.length === 0 || selectedAdGroups.includes(d.adGroup);
      const matchesMatchType = selectedMatchTypes.length === 0 || selectedMatchTypes.includes(d.matchType);
      const matchesCompetitor = selectedCompetitors.length === 0 || selectedCompetitors.includes(d.competitor);
      
      let matchesDate = true;
      if (startDate || endDate) {
        const start = startDate ? new Date(startDate) : new Date(0);
        const end = endDate ? new Date(endDate) : new Date(8640000000000000);
        matchesDate = isWithinInterval(d.date, { start, end });
      }

      return matchesKeyword && matchesCampaign && matchesAdGroup && matchesMatchType && matchesCompetitor && matchesDate;
    });
  }, [data, selectedKeywords, selectedCampaigns, selectedAdGroups, selectedMatchTypes, selectedCompetitors, startDate, endDate]);

  const pivotData = useMemo(() => {
    const timeGetter = activeTab === 'day' ? (d: Date) => d : (activeTab === 'week' ? startOfWeek : startOfMonth);
    const timeFormat = activeTab === 'day' ? 'MMM dd' : (activeTab === 'week' ? 'MMM dd, yyyy' : 'MMM yyyy');
    
    // Sort unique dates first
    const uniqueTimestamps: number[] = Array.from(new Set(
      filteredData.map(d => timeGetter(d.date).getTime())
    )).sort((a, b) => a - b);

    const timeKeys = uniqueTimestamps.map(t => ({
      key: t.toString(),
      label: format(new Date(t), timeFormat)
    }));

    const grouped: { [key: string]: PivotData } = {};

    filteredData.forEach(d => {
      const key = `${d.campaign}|${d.adGroup}|${d.keyword}|${d.competitor}`;
      const timestampKey = timeGetter(d.date).getTime().toString();

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
      grouped[key].values[timestampKey] = d.impressionShare;
    });

    let rows = Object.values(grouped);
    
    if (sortConfig) {
      rows.sort((a, b) => {
        let aValue: any;
        let bValue: any;

        if (['campaign', 'adGroup', 'keyword', 'competitor'].includes(sortConfig.key)) {
          aValue = (a as any)[sortConfig.key];
          bValue = (b as any)[sortConfig.key];
        } else {
          // It's a timestamp key
          aValue = a.values[sortConfig.key] || 0;
          bValue = b.values[sortConfig.key] || 0;
        }

        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return {
      rows,
      timeKeys
    };
  }, [filteredData, activeTab, sortConfig]);

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
        percentage: (themes.size / totalThemesCount) * 100,
        themes: Array.from(themes)
      }))
      .sort((a, b) => b.count - a.count);
  }, [filteredData]);

  const themesData = useMemo(() => {
    const themes = Array.from(new Set(filteredData.map(d => d.keyword)));
    return themes.map(theme => {
      const themeComps = Array.from(new Set(
        filteredData.filter(d => d.keyword === theme).map(d => d.competitor)
      )).filter(c => c !== 'You');
      return {
        theme,
        competitors: themeComps,
        count: themeComps.length
      };
    }).sort((a, b) => b.count - a.count);
  }, [filteredData]);

  const totalThemesCount = useMemo(() => {
    return new Set(filteredData.map(d => d.keyword)).size;
  }, [filteredData]);

  const filterOptions = useMemo(() => {
    return {
      keywords: Array.from(new Set(data.map(d => d.keyword))),
      campaigns: Array.from(new Set(data.map(d => d.campaign))),
      adGroups: Array.from(new Set(data.map(d => d.adGroup))),
      matchTypes: Array.from(new Set(data.map(d => d.matchType))),
      competitors: Array.from(new Set(data.map(d => d.competitor)))
    };
  }, [data]);

  const chartData = useMemo(() => {
    const timeGetter = activeTab === 'day' ? (d: Date) => d : (activeTab === 'week' ? startOfWeek : startOfMonth);
    const timeFormat = activeTab === 'day' ? 'MMM dd' : (activeTab === 'week' ? 'MMM dd, yyyy' : 'MMM yyyy');
    
    const uniqueTimestamps: number[] = Array.from(new Set(
      filteredData.map(d => timeGetter(d.date).getTime())
    )).sort((a, b) => a - b);

    return uniqueTimestamps.map(t => {
      const timestampKey = t.toString();
      const point: any = { name: format(new Date(t), timeFormat) };
      
      // Aggregate by competitor for this timestamp
      const compValues: { [comp: string]: { sum: number, count: number } } = {};
      
      filteredData.forEach(d => {
        if (timeGetter(d.date).getTime() === t) {
          if (!compValues[d.competitor]) {
            compValues[d.competitor] = { sum: 0, count: 0 };
          }
          compValues[d.competitor].sum += d.impressionShare;
          compValues[d.competitor].count += 1;
        }
      });

      Object.entries(compValues).forEach(([comp, stats]) => {
        point[comp] = Math.round((stats.sum / stats.count) * 100);
      });

      return point;
    });
  }, [filteredData, activeTab]);

  const competitors = useMemo(() => Array.from(new Set(filteredData.map(d => d.competitor))), [filteredData]);

  const generateInsights = async () => {
    setIsGeneratingInsights(true);
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        setInsights("Error: Gemini API key is missing. Please check your environment variables.");
        setIsGeneratingInsights(false);
        return;
      }
      
      const ai = new GoogleGenAI({ apiKey });
      
      const prompt = `
        You are an expert Google Ads analyst. Analyze the following Auction Insights data and provide actionable insights about each competitor based on their impression share and theme coverage.
        
        Current Filters Applied:
        - Keywords: ${selectedKeywords.length > 0 ? selectedKeywords.join(', ') : 'All'}
        - Campaigns: ${selectedCampaigns.length > 0 ? selectedCampaigns.join(', ') : 'All'}
        - Ad Groups: ${selectedAdGroups.length > 0 ? selectedAdGroups.join(', ') : 'All'}
        - Match Types: ${selectedMatchTypes.length > 0 ? selectedMatchTypes.join(', ') : 'All'}
        - Competitors: ${selectedCompetitors.length > 0 ? selectedCompetitors.join(', ') : 'All'}
        - Date Range: ${startDate || 'Start'} to ${endDate || 'End'}

        Data Summary:
        - Total Themes: ${totalThemesCount}
        - Competitors: ${competitors.join(', ')}
        
        Theme Share Data:
        ${JSON.stringify(themeShareData, null, 2)}
        
        Impression Share Data (Pivot):
        ${JSON.stringify(pivotData.rows.slice(0, 50), null, 2)}

        Provide a concise, professional analysis. Focus on:
        1. Who are the most aggressive competitors?
        2. Are there any emerging threats?
        3. What are the key areas of overlap?
        4. Recommendations for our own strategy.
        
        Ensure the insights are specific to the filtered data provided above.
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
            <div className="flex items-center gap-2">
              {data.length > 0 && (
                <>
                  <button 
                    onClick={randomizeCurrentData}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium px-2 py-1 transition-colors flex items-center gap-1"
                    title="Randomize metrics for current data"
                  >
                    <Sparkles className="w-3 h-3" />
                    Randomize
                  </button>
                  <button 
                    onClick={() => setData([])}
                    className="text-xs text-[#5F6368] hover:text-red-600 font-medium px-2 py-1 transition-colors"
                  >
                    Clear Data
                  </button>
                </>
              )}
              <label className="cursor-pointer bg-white border border-[#D1D1D1] hover:bg-[#F1F3F4] px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2">
                <Upload className="w-4 h-4" />
                Upload CSV
                <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
              </label>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {data.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] bg-white rounded-2xl border-2 border-dashed border-[#E0E0E0] p-12 text-center">
            <div className="bg-indigo-50 p-6 rounded-full mb-6">
              <Upload className="w-12 h-12 text-indigo-600" />
            </div>
            <h2 className="text-2xl font-bold text-[#1A1A1A] mb-4">Welcome to Auction Insights Pro</h2>
            
            {error && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm max-w-md flex items-start gap-3"
              >
                <Info className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <p>{error}</p>
              </motion.div>
            )}

            <p className="text-[#5F6368] max-w-md mb-8">
              Upload your Google Ads Auction Insights CSV report to start analyzing competitor trends, theme share, and AI-powered insights.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <label className="cursor-pointer bg-indigo-600 text-white hover:bg-indigo-700 px-8 py-3 rounded-xl font-semibold transition-all shadow-lg hover:shadow-xl flex items-center gap-2">
                <Upload className="w-5 h-5" />
                Select CSV File
                <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
              </label>
              <button 
                onClick={generateSampleData}
                className="bg-white border-2 border-[#E0E0E0] hover:border-indigo-600 hover:text-indigo-600 px-8 py-3 rounded-xl font-semibold transition-all flex items-center gap-2"
              >
                <Sparkles className="w-5 h-5" />
                Generate Sample Data
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Controls Grid */}
            <div className="bg-white rounded-xl shadow-sm border border-[#E0E0E0] p-6 mb-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-[#1A1A1A] flex items-center gap-2">
                  <Filter className="w-5 h-5 text-indigo-600" />
                  Advanced Filters
                </h2>
                <button 
                  onClick={clearAllFilters}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 uppercase tracking-wider"
                >
                  Clear All Filters
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-[#5F6368] uppercase tracking-wider">Search Competitor</label>
                    {selectedCompetitors.length > 0 && (
                      <button onClick={() => setSelectedCompetitors([])} className="text-[10px] text-indigo-600 hover:underline font-bold uppercase">Clear All</button>
                    )}
                  </div>
                  <MultiSelect 
                    options={filterOptions.competitors}
                    selected={selectedCompetitors}
                    onChange={setSelectedCompetitors}
                    placeholder="All Competitors"
                    icon={<Search className="w-4 h-4" />}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-[#5F6368] uppercase tracking-wider">Campaign</label>
                    {selectedCampaigns.length > 0 && (
                      <button onClick={() => setSelectedCampaigns([])} className="text-[10px] text-indigo-600 hover:underline font-bold uppercase">Clear All</button>
                    )}
                  </div>
                  <MultiSelect 
                    options={filterOptions.campaigns}
                    selected={selectedCampaigns}
                    onChange={setSelectedCampaigns}
                    placeholder="All Campaigns"
                    icon={<Target className="w-4 h-4" />}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-[#5F6368] uppercase tracking-wider">Ad Group</label>
                    {selectedAdGroups.length > 0 && (
                      <button onClick={() => setSelectedAdGroups([])} className="text-[10px] text-indigo-600 hover:underline font-bold uppercase">Clear All</button>
                    )}
                  </div>
                  <MultiSelect 
                    options={filterOptions.adGroups}
                    selected={selectedAdGroups}
                    onChange={setSelectedAdGroups}
                    placeholder="All Ad Groups"
                    icon={<Layers className="w-4 h-4" />}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-[#5F6368] uppercase tracking-wider">Keyword</label>
                    {selectedKeywords.length > 0 && (
                      <button onClick={() => setSelectedKeywords([])} className="text-[10px] text-indigo-600 hover:underline font-bold uppercase">Clear All</button>
                    )}
                  </div>
                  <MultiSelect 
                    options={filterOptions.keywords}
                    selected={selectedKeywords}
                    onChange={setSelectedKeywords}
                    placeholder="All Keywords"
                    icon={<Filter className="w-4 h-4" />}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-[#5F6368] uppercase tracking-wider">Match Type</label>
                    {selectedMatchTypes.length > 0 && (
                      <button onClick={() => setSelectedMatchTypes([])} className="text-[10px] text-indigo-600 hover:underline font-bold uppercase">Clear All</button>
                    )}
                  </div>
                  <MultiSelect 
                    options={filterOptions.matchTypes}
                    selected={selectedMatchTypes}
                    onChange={setSelectedMatchTypes}
                    placeholder="All Match Types"
                    icon={<Type className="w-4 h-4" />}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-[#5F6368] uppercase tracking-wider">Date Range</label>
                    {(startDate || endDate) && (
                      <button onClick={() => { setStartDate(''); setEndDate(''); }} className="text-[10px] text-indigo-600 hover:underline font-bold uppercase">Clear All</button>
                    )}
                  </div>
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
                  onClick={() => setActiveTab('day')}
                  className={cn(
                    "flex-1 py-1.5 text-xs font-medium rounded-md transition-all flex items-center justify-center gap-1",
                    activeTab === 'day' ? "bg-white shadow-sm text-indigo-600" : "text-[#5F6368] hover:text-[#1A1A1A]"
                  )}
                >
                  Daily
                </button>
                <button 
                  onClick={() => setActiveTab('week')}
                  className={cn(
                    "flex-1 py-1.5 text-xs font-medium rounded-md transition-all flex items-center justify-center gap-1",
                    activeTab === 'week' ? "bg-white shadow-sm text-indigo-600" : "text-[#5F6368] hover:text-[#1A1A1A]"
                  )}
                >
                  Weekly
                </button>
                <button 
                  onClick={() => setActiveTab('month')}
                  className={cn(
                    "flex-1 py-1.5 text-xs font-medium rounded-md transition-all flex items-center justify-center gap-1",
                    activeTab === 'month' ? "bg-white shadow-sm text-indigo-600" : "text-[#5F6368] hover:text-[#1A1A1A]"
                  )}
                >
                  Monthly
                </button>
              </div>
            </div>
          </div>
        </div>

        {activeView === 'dashboard' && (
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
                  <LineChart data={chartData} margin={{ bottom: 50, left: 10, right: 10, top: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F3F4" />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{fill: '#5F6368', fontSize: 11}}
                      angle={-45}
                      textAnchor="end"
                      height={60}
                      interval="preserveStartEnd"
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
                      <th 
                        onClick={() => handleSort('campaign')}
                        className="px-6 py-4 text-xs font-semibold text-[#5F6368] uppercase tracking-wider border-b border-[#E0E0E0] sticky left-0 bg-[#F8F9FA] z-10 min-w-[150px] cursor-pointer hover:bg-[#F1F3F4] transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          Campaign
                          {getSortIcon('campaign')}
                        </div>
                      </th>
                      <th 
                        onClick={() => handleSort('adGroup')}
                        className="px-6 py-4 text-xs font-semibold text-[#5F6368] uppercase tracking-wider border-b border-[#E0E0E0] min-w-[150px] cursor-pointer hover:bg-[#F1F3F4] transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          Ad Group
                          {getSortIcon('adGroup')}
                        </div>
                      </th>
                      <th 
                        onClick={() => handleSort('keyword')}
                        className="px-6 py-4 text-xs font-semibold text-[#5F6368] uppercase tracking-wider border-b border-[#E0E0E0] min-w-[150px] cursor-pointer hover:bg-[#F1F3F4] transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          Keyword
                          {getSortIcon('keyword')}
                        </div>
                      </th>
                      <th 
                        onClick={() => handleSort('competitor')}
                        className="px-6 py-4 text-xs font-semibold text-[#5F6368] uppercase tracking-wider border-b border-[#E0E0E0] min-w-[150px] cursor-pointer hover:bg-[#F1F3F4] transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          Competitor
                          {getSortIcon('competitor')}
                        </div>
                      </th>
                      {pivotData.timeKeys.map(tk => (
                        <th 
                          key={tk.key} 
                          onClick={() => handleSort(tk.key)}
                          className="px-6 py-4 text-xs font-semibold text-[#5F6368] uppercase tracking-wider border-b border-[#E0E0E0] text-center min-w-[120px] cursor-pointer hover:bg-[#F1F3F4] transition-colors"
                        >
                          <div className="flex flex-col items-center gap-1">
                            {tk.label}
                            {getSortIcon(tk.key)}
                          </div>
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
                            <td key={tk.key} className="px-6 py-4 border-b border-[#E0E0E0] text-center">
                              {row.values[tk.key] !== undefined ? (
                                <div className="flex flex-col items-center gap-1">
                                  <span className="text-sm font-semibold">
                                    {Math.round(row.values[tk.key] * 100)}%
                                  </span>
                                  <div className="w-16 h-1 bg-[#E0E0E0] rounded-full overflow-hidden">
                                    <div 
                                      className="h-full bg-indigo-500 rounded-full" 
                                      style={{ width: `${row.values[tk.key] * 100}%` }}
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
        )}

        {activeView === 'themes' && (
          <div className="space-y-8">
            {/* Theme Share Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
              {/* Themes Box */}
              <div className="bg-white rounded-xl shadow-sm border border-[#E0E0E0] flex flex-col h-[600px]">
                <div className="p-6 border-b border-[#E0E0E0]">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Type className="w-5 h-5 text-indigo-600" />
                    Themes (Keywords)
                  </h2>
                  <p className="text-xs text-[#5F6368] mt-1">Select a theme to see competing domains</p>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  {themesData.map((item) => (
                    <button
                      key={item.theme}
                      onClick={() => {
                        setSelectedThemeInShare(item.theme);
                        setSelectedCompInShare(null);
                      }}
                      className={cn(
                        "w-full text-left p-4 rounded-xl border transition-all flex items-center justify-between group",
                        selectedThemeInShare === item.theme
                          ? "bg-indigo-50 border-indigo-200 ring-1 ring-indigo-200"
                          : "bg-white border-[#E0E0E0] hover:border-indigo-200 hover:bg-[#F8F9FA]"
                      )}
                    >
                      <div>
                        <p className="font-semibold text-[#1A1A1A]">{item.theme}</p>
                        <p className="text-xs text-[#5F6368]">{item.count} competitors appearing</p>
                      </div>
                      <div className="bg-white px-3 py-1 rounded-full border border-[#E0E0E0] text-xs font-bold text-indigo-600">
                        {item.count}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Competitors Box */}
              <div className="bg-white rounded-xl shadow-sm border border-[#E0E0E0] flex flex-col h-[600px]">
                <div className="p-6 border-b border-[#E0E0E0]">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Target className="w-5 h-5 text-indigo-600" />
                    Competitors
                  </h2>
                  <p className="text-xs text-[#5F6368] mt-1">Select a competitor to see shared themes</p>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  {themeShareData.map((item) => (
                    <button
                      key={item.competitor}
                      onClick={() => {
                        setSelectedCompInShare(item.competitor);
                        setSelectedThemeInShare(null);
                      }}
                      className={cn(
                        "w-full text-left p-4 rounded-xl border transition-all flex items-center justify-between group",
                        selectedCompInShare === item.competitor
                          ? "bg-emerald-50 border-emerald-200 ring-1 ring-emerald-200"
                          : "bg-white border-[#E0E0E0] hover:border-emerald-200 hover:bg-[#F8F9FA]"
                      )}
                    >
                      <div>
                        <p className="font-semibold text-[#1A1A1A]">{item.competitor}</p>
                        <p className="text-xs text-[#5F6368]">{item.count} shared themes</p>
                      </div>
                      <div className="bg-white px-3 py-1 rounded-full border border-[#E0E0E0] text-xs font-bold text-emerald-600">
                        {item.percentage.toFixed(0)}%
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Details Box */}
            {(selectedThemeInShare || selectedCompInShare) && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white rounded-xl shadow-lg border-2 border-indigo-100 p-8"
              >
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-xl font-bold text-[#1A1A1A]">
                      {selectedThemeInShare ? `Competitors for "${selectedThemeInShare}"` : `Themes shared by ${selectedCompInShare}`}
                    </h3>
                    <p className="text-sm text-[#5F6368]">
                      {selectedThemeInShare 
                        ? `Listing all domains appearing for this specific keyword theme.`
                        : `Listing all keyword themes where this competitor has impression share.`}
                    </p>
                  </div>
                  <button 
                    onClick={() => {
                      setSelectedThemeInShare(null);
                      setSelectedCompInShare(null);
                    }}
                    className="text-sm text-[#5F6368] hover:text-[#1A1A1A] font-medium"
                  >
                    Clear Selection
                  </button>
                </div>
                <div className="flex flex-wrap gap-3">
                  {selectedThemeInShare ? (
                    themesData.find(t => t.theme === selectedThemeInShare)?.competitors.map(comp => (
                      <div key={comp} className="px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg border border-indigo-100 font-medium">
                        {comp}
                      </div>
                    ))
                  ) : (
                    themeShareData.find(c => c.competitor === selectedCompInShare)?.themes.map(theme => (
                      <div key={theme} className="px-4 py-2 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-100 font-medium">
                        {theme}
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}

            {/* Theme Share Chart */}
            <div className="bg-white rounded-xl shadow-sm border border-[#E0E0E0] p-6">
              <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-indigo-600" />
                Competitor Theme Coverage Visualization
              </h2>
              <div className="h-[400px] w-full">
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

            {/* Theme Heat Matrix */}
            <div className="bg-white rounded-xl shadow-sm border border-[#E0E0E0] p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Layers className="w-5 h-5 text-indigo-600" />
                    Theme vs. Competitor Heat Matrix
                  </h2>
                  <p className="text-xs text-[#5F6368] mt-1">Color intensity represents Impression Share for each theme/competitor pair</p>
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <div className="min-w-[800px]">
                  <div className="grid grid-cols-[150px_1fr] border-b border-[#E0E0E0] bg-[#F8F9FA]">
                    <div className="p-3 text-xs font-bold text-[#5F6368] uppercase tracking-wider border-r border-[#E0E0E0]">Theme</div>
                    <div className="flex">
                      {themeShareData.map(comp => (
                        <div key={comp.competitor} className="flex-1 p-3 text-[10px] font-bold text-[#5F6368] uppercase tracking-wider text-center border-r border-[#E0E0E0] last:border-r-0 truncate" title={comp.competitor}>
                          {comp.competitor}
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div className="max-h-[500px] overflow-y-auto">
                    {themesData.map((themeObj) => (
                      <div key={themeObj.theme} className="grid grid-cols-[150px_1fr] border-b border-[#E0E0E0] hover:bg-[#F8F9FA] transition-colors">
                        <div className="p-3 text-xs font-medium text-[#1A1A1A] border-r border-[#E0E0E0] truncate" title={themeObj.theme}>
                          {themeObj.theme}
                        </div>
                        <div className="flex">
                          {themeShareData.map(comp => {
                            // Find avg impression share for this theme/competitor pair
                            const matches = filteredData.filter(d => d.keyword === themeObj.theme && d.competitor === comp.competitor);
                            const avgIS = matches.length > 0 
                              ? matches.reduce((acc, curr) => acc + curr.impressionShare, 0) / matches.length 
                              : 0;
                            
                            const opacity = avgIS > 0 ? Math.max(0.1, avgIS) : 0;
                            const bgColor = avgIS > 0 ? `rgba(79, 70, 229, ${opacity})` : 'transparent';
                            
                            return (
                              <div 
                                key={comp.competitor} 
                                className="flex-1 h-10 border-r border-[#E0E0E0] last:border-r-0 flex items-center justify-center text-[10px] font-bold"
                                style={{ backgroundColor: bgColor, color: avgIS > 0.5 ? 'white' : '#1A1A1A' }}
                                title={`${comp.competitor} on ${themeObj.theme}: ${(avgIS * 100).toFixed(1)}% IS`}
                              >
                                {avgIS > 0 ? `${(avgIS * 100).toFixed(0)}%` : '-'}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              
              <div className="mt-4 flex items-center gap-4 text-[10px] text-[#5F6368] font-medium uppercase tracking-widest">
                <span>Intensity:</span>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-indigo-50 border border-[#E0E0E0]"></div>
                  <span>Low IS</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-indigo-600"></div>
                  <span>High IS</span>
                </div>
              </div>
            </div>
          </div>
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
          </>
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
