"use client";

import React, { useState, useCallback, useMemo, useEffect } from "react";
import Papa from "papaparse";
import _ from "lodash";
import { createClient } from "@supabase/supabase-js"; // <--- THIS is the correct import
import {
  LineChart, Line, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Label
} from "recharts";
import { 
  UploadCloud, FileText, TrendingUp, Trophy, 
  Crosshair, Timer, Monitor, Activity, BatteryCharging, Shuffle, LogIn, LogOut, Cloud
} from "lucide-react";

// --- 1. DATABASE CONNECTION (INLINED) ---
// We create the connection right here so we don't need a separate file
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// --- 2. TYPES ---
type KovaaksDataPoint = {
  id: string;
  date: string;
  score: number;
  scenario: string;
  accuracy: number;
  ttk: number;
  fps: number;
  fatigue: number; 
};

type ParsedResults = Record<string, KovaaksDataPoint[]>;
type MetricType = 'score' | 'accuracy' | 'ttk' | 'fps' | 'fatigue' | 'correlation';

export default function KovaaksTracker() {
  const [stats, setStats] = useState<ParsedResults>({});
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);
  const [currentMetric, setCurrentMetric] = useState<MetricType>('score');
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Auth State
  const [user, setUser] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showLogin, setShowLogin] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // --- 3. AUTH LOGIC ---
  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    checkUser();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
       setUser(session?.user ?? null);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const handleLogin = async () => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
    else setShowLogin(false);
  };

  const handleSignUp = async () => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) alert(error.message);
    else alert("Check your email for the confirmation link!");
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  // --- 4. CLOUD SYNC LOGIC ---
  const handleSyncToCloud = async () => {
    if (!user) return alert("You must be logged in to sync.");
    if (Object.keys(stats).length === 0) return alert("No stats to sync.");

    setIsSyncing(true);
    
    // Convert our stats object into a flat list for the database
    const allStats = Object.values(stats).flat().map(s => ({
       user_id: user.id,
       scenario: s.scenario,
       score: s.score,
       accuracy: s.accuracy,
       ttk: s.ttk,
       fps: s.fps,
       fatigue: s.fatigue,
       played_at: s.date
    }));

    const BATCH_SIZE = 100;
    let errorCount = 0;

    for (let i = 0; i < allStats.length; i += BATCH_SIZE) {
        const batch = allStats.slice(i, i + BATCH_SIZE);
        const { error } = await supabase.from('scores').insert(batch);
        if (error) {
            console.error("Sync error:", error);
            errorCount++;
        }
    }

    setIsSyncing(false);
    if (errorCount === 0) alert("Successfully synced all stats to the cloud!");
    else alert(`Sync finished with some errors. Check console.`);
  };

  // --- 5. PARSING LOGIC ---
  const parseFileName = (fileName: string) => {
    const cleanName = fileName.replace(".csv", "").replace(" Stats", "");
    const parts = cleanName.split(" - ");
    const dateRaw = parts[parts.length - 1];
    const scenario = parts[0].trim();
    return { scenario, dateRaw };
  };

  const calculateAverage = (values: number[]) => {
    if (values.length === 0) return 0;
    const sum = values.reduce((a, b) => a + b, 0);
    return sum / values.length;
  };

  const timeToSeconds = (timeStr: string) => {
    if (!timeStr) return 0;
    const parts = timeStr.split(":");
    if (parts.length < 3) return 0;
    const hours = parseFloat(parts[0]);
    const minutes = parseFloat(parts[1]);
    const seconds = parseFloat(parts[2]);
    return (hours * 3600) + (minutes * 60) + seconds;
  };

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsProcessing(true);

    const files = Array.from(e.dataTransfer.files);
    const validFiles = files.filter((f) => f.name.endsWith(".csv"));
    const newStats: KovaaksDataPoint[] = [];
    let processedCount = 0;

    if (validFiles.length === 0) {
      setIsProcessing(false);
      return;
    }

    validFiles.forEach((file) => {
      const { scenario, dateRaw } = parseFileName(file.name);
      const formattedDate = dateRaw.replace(/\./g, "-").replace("-", "T").replace(/\./g, ":");

      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        let fps = 0;
        
        const footer = text.slice(-500); 
        const fpsMatch = footer.match(/Avg FPS:?,?(\d+\.?\d*)/i);
        if (fpsMatch && fpsMatch[1]) {
            fps = parseFloat(fpsMatch[1]);
        }

        Papa.parse(file, {
            header: false,
            skipEmptyLines: true,
            complete: (results: any) => {
              const rows = results.data as string[][];
              if (rows.length > 0) {
                let score = 0;
                let avgAcc = 0;
                let avgTTK = 0;
                let fatigueIndex = 0;
                let dataFound = false;

                let headerIndex = -1;
                for (let i = 0; i < Math.min(rows.length, 25); i++) {
                  const rowStr = rows[i].join(",").toLowerCase();
                  if (rowStr.includes("kill #") || rowStr.includes("kill#")) {
                    headerIndex = i;
                    break;
                  }
                }

                if (headerIndex !== -1) {
                  const header = rows[headerIndex].map(c => c.trim().toLowerCase());
                  
                  const dmgIdx = header.findIndex(c => c === "damage done");
                  const accIdx = header.findIndex(c => c === "accuracy");
                  const ttkIdx = header.findIndex(c => c === "ttk");
                  const timeIdx = header.findIndex(c => c === "timestamp");
                  
                  const accValues: number[] = [];
                  const ttkValues: number[] = [];
                  const killTimes: number[] = [];
                  let totalScore = 0;

                  for (let i = headerIndex + 1; i < rows.length; i++) {
                    const row = rows[i];
                    if (!row[0] || row[0].includes(":")) break; 

                    if (dmgIdx !== -1) {
                        const val = parseFloat(row[dmgIdx]);
                        if (!isNaN(val)) totalScore += val;
                    }
                    if (accIdx !== -1) {
                        const val = parseFloat(row[accIdx]);
                        if (!isNaN(val)) accValues.push(val);
                    }
                    if (ttkIdx !== -1) {
                        const valStr = row[ttkIdx].replace("s", "");
                        const val = parseFloat(valStr);
                        if (!isNaN(val)) ttkValues.push(val);
                    }
                    if (timeIdx !== -1) {
                        const seconds = timeToSeconds(row[timeIdx]);
                        if (seconds > 0) killTimes.push(seconds);
                    }
                  }

                  score = totalScore;
                  avgAcc = calculateAverage(accValues) * 100;
                  avgTTK = calculateAverage(ttkValues);

                  if (killTimes.length > 4) {
                      const start = killTimes[0];
                      const end = killTimes[killTimes.length - 1];
                      const duration = end - start;
                      
                      if (duration > 10) {
                          const midPoint = start + (duration / 2);
                          let firstHalfKills = 0;
                          let secondHalfKills = 0;

                          killTimes.forEach(t => {
                              if (t <= midPoint) firstHalfKills++;
                              else secondHalfKills++;
                          });

                          if (firstHalfKills > 0) {
                              fatigueIndex = (secondHalfKills / firstHalfKills) * 100;
                          }
                      }
                  }
                  dataFound = true;
                }

                if (dataFound) {
                  newStats.push({
                    id: Math.random().toString(36).substr(2, 9),
                    date: formattedDate,
                    score: score,
                    accuracy: avgAcc,
                    ttk: avgTTK,
                    fps: fps, 
                    fatigue: fatigueIndex,
                    scenario: scenario,
                  });
                }
              }
              processedCount++;
              if (processedCount === validFiles.length) {
                processAndSaveStats(newStats);
              }
            }
        });
      };
      reader.readAsText(file);
    });
  }, []);

  const processAndSaveStats = (newData: KovaaksDataPoint[]) => {
    setStats((prevStats) => {
      const combined = [...Object.values(prevStats).flat(), ...newData];
      const grouped = _.groupBy(combined, "scenario");
      Object.keys(grouped).forEach((key) => {
        grouped[key] = grouped[key].sort((a, b) => a.date.localeCompare(b.date));
      });
      return grouped;
    });
    setIsProcessing(false);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const sortedScenarios = useMemo(() => {
    return Object.keys(stats).sort((a, b) => stats[b].length - stats[a].length);
  }, [stats]);

  useMemo(() => {
    if (!selectedScenario && sortedScenarios.length > 0) {
      setSelectedScenario(sortedScenarios[0]);
    }
  }, [sortedScenarios, selectedScenario]);

  const currentScenarioData = useMemo(() => {
    if (!selectedScenario || !stats[selectedScenario]) return [];
    return stats[selectedScenario];
  }, [stats, selectedScenario]);

  const personalBests = useMemo(() => {
    return [...currentScenarioData]
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [currentScenarioData]);

  const avgStamina = useMemo(() => {
    const validRuns = currentScenarioData.filter(s => s.fatigue > 0);
    if (validRuns.length === 0) return 0;
    return calculateAverage(validRuns.map(s => s.fatigue));
  }, [currentScenarioData]);

  const getMetricColor = () => {
    switch (currentMetric) {
        case 'accuracy': return '#10b981';
        case 'ttk': return '#f59e0b';
        case 'fps': return '#8b5cf6';
        case 'fatigue': return '#ef4444';
        case 'correlation': return '#ec4899';
        default: return '#3b82f6';
    }
  };

  const getMetricLabel = (key: string) => {
      if (key === 'score') return 'Score';
      if (key === 'accuracy') return 'Accuracy %';
      if (key === 'ttk') return 'Avg TTK (s)';
      if (key === 'fps') return 'Avg FPS';
      if (key === 'fatigue') return 'Stamina %';
      return '';
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 font-sans selection:bg-indigo-500/30">
      <div className="max-w-7xl mx-auto p-6 space-y-8">
        
        {/* Header & Auth */}
        <header className="flex items-center justify-between pb-6 border-b border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600 rounded-lg">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">KovaaK's Analytics</h1>
              <p className="text-neutral-500 text-sm">V2 • Cloud Sync</p>
            </div>
          </div>

          <div className="flex gap-4">
             {user ? (
                 <div className="flex items-center gap-4">
                     <span className="text-sm text-neutral-400">Logged in as {user.email}</span>
                     
                     {Object.keys(stats).length > 0 && (
                        <button 
                            onClick={handleSyncToCloud}
                            disabled={isSyncing}
                            className={`flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors ${isSyncing ? 'opacity-50' : ''}`}
                        >
                            <Cloud className="w-4 h-4" /> {isSyncing ? 'Syncing...' : 'Sync to Cloud'}
                        </button>
                     )}

                     <button onClick={handleLogout} className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg text-sm font-medium transition-colors">
                        <LogOut className="w-4 h-4" /> Logout
                     </button>
                 </div>
             ) : (
                <button onClick={() => setShowLogin(!showLogin)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors">
                    <LogIn className="w-4 h-4" /> Login / Signup
                </button>
             )}
          </div>
        </header>

        {/* Login Modal */}
        {showLogin && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-neutral-900 border border-neutral-700 p-8 rounded-xl w-96 space-y-4">
                    <h2 className="text-xl font-bold text-white mb-4">Account Access</h2>
                    <input 
                        type="email" 
                        placeholder="Email" 
                        className="w-full bg-neutral-950 border border-neutral-800 p-3 rounded text-white"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />
                     <input 
                        type="password" 
                        placeholder="Password" 
                        className="w-full bg-neutral-950 border border-neutral-800 p-3 rounded text-white"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                    />
                    <div className="flex gap-2 pt-2">
                        <button onClick={handleLogin} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white p-2 rounded">Log In</button>
                        <button onClick={handleSignUp} className="flex-1 bg-neutral-800 hover:bg-neutral-700 text-white p-2 rounded">Sign Up</button>
                    </div>
                    <button onClick={() => setShowLogin(false)} className="w-full text-center text-xs text-neutral-500 hover:text-white mt-2">Close</button>
                </div>
            </div>
        )}

        {/* Drop Zone */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className={`
            relative group cursor-pointer border-2 border-dashed rounded-2xl p-10 text-center transition-all duration-300
            ${isProcessing 
              ? "border-indigo-500 bg-indigo-500/5" 
              : "border-neutral-800 hover:border-indigo-500 hover:bg-neutral-900"
            }
          `}
        >
          <div className="flex flex-col items-center gap-4">
            <div className={`p-4 rounded-full bg-neutral-900 group-hover:bg-indigo-500/10 transition-colors`}>
              <UploadCloud className={`w-8 h-8 ${isProcessing ? 'text-indigo-400 animate-bounce' : 'text-neutral-400 group-hover:text-indigo-400'}`} />
            </div>
            <div>
              <p className="text-lg font-medium text-white">
                {isProcessing ? "Processing Metrics..." : "Drop Detailed Stats CSVs"}
              </p>
              <p className="text-sm text-neutral-500 mt-1">
                Reads <span className="text-blue-400">Score</span>, <span className="text-emerald-400">Acc</span>, <span className="text-amber-400">TTK</span>, <span className="text-red-400">Stamina</span>, and <span className="text-violet-400">FPS</span>.
              </p>
            </div>
          </div>
        </div>

        {/* Main Dashboard */}
        {Object.keys(stats).length > 0 && (
          <div className="grid grid-cols-12 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            
            {/* Sidebar */}
            <div className="col-span-3 bg-neutral-900/50 border border-neutral-800 rounded-xl flex flex-col h-[600px]">
              <div className="p-4 border-b border-neutral-800 flex items-center gap-2">
                <FileText className="w-4 h-4 text-neutral-500" />
                <span className="font-semibold text-neutral-300">Scenarios</span>
                <span className="ml-auto text-xs bg-neutral-800 px-2 py-0.5 rounded-full text-neutral-400">
                  {Object.keys(stats).length}
                </span>
              </div>
              <div className="overflow-y-auto flex-1 p-2 space-y-1 custom-scrollbar">
                {sortedScenarios.map((scen) => (
                  <button
                    key={scen}
                    onClick={() => setSelectedScenario(scen)}
                    className={`
                      w-full text-left px-3 py-2.5 rounded-lg text-sm truncate transition-all flex justify-between items-center group
                      ${selectedScenario === scen
                        ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/20 font-medium"
                        : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
                      }
                    `}
                  >
                    <span className="truncate">{scen}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      selectedScenario === scen ? 'bg-indigo-500 text-white' : 'bg-neutral-800 text-neutral-500 group-hover:bg-neutral-700'
                    }`}>
                      {stats[scen].length}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Content Area */}
            <div className="col-span-9 space-y-6">
              
              {/* Metric Selector Tabs */}
              <div className="flex flex-wrap gap-2 p-1 bg-neutral-900/50 border border-neutral-800 rounded-xl w-fit">
                 <button 
                   onClick={() => setCurrentMetric('score')}
                   className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${currentMetric === 'score' ? 'bg-blue-600 text-white shadow-lg' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`}
                 >
                   <Trophy className="w-4 h-4" /> Score
                 </button>
                 <button 
                   onClick={() => setCurrentMetric('accuracy')}
                   className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${currentMetric === 'accuracy' ? 'bg-emerald-600 text-white shadow-lg' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`}
                 >
                   <Crosshair className="w-4 h-4" /> Accuracy
                 </button>
                 <button 
                   onClick={() => setCurrentMetric('ttk')}
                   className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${currentMetric === 'ttk' ? 'bg-amber-600 text-white shadow-lg' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`}
                 >
                   <Timer className="w-4 h-4" /> TTK
                 </button>
                 <button 
                   onClick={() => setCurrentMetric('fps')}
                   className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${currentMetric === 'fps' ? 'bg-violet-600 text-white shadow-lg' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`}
                 >
                   <Monitor className="w-4 h-4" /> FPS
                 </button>
                 <button 
                   onClick={() => setCurrentMetric('fatigue')}
                   className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${currentMetric === 'fatigue' ? 'bg-red-600 text-white shadow-lg' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`}
                 >
                   <BatteryCharging className="w-4 h-4" /> Stamina
                 </button>
                 <button 
                   onClick={() => setCurrentMetric('correlation')}
                   className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${currentMetric === 'correlation' ? 'bg-pink-600 text-white shadow-lg' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`}
                 >
                   <Shuffle className="w-4 h-4" /> Acc vs Speed
                 </button>
              </div>

              {/* Chart */}
              <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-6 h-[400px]">
                {selectedScenario ? (
                    <ResponsiveContainer width="100%" height="100%">
                      {currentMetric === 'correlation' ? (
                        <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                          <XAxis 
                            type="number" 
                            dataKey="accuracy" 
                            name="Accuracy" 
                            unit="%" 
                            stroke="#737373"
                            domain={['auto', 'auto']}
                          >
                             <Label value="Accuracy (%)" offset={0} position="insideBottom" fill="#737373" />
                          </XAxis>
                          <YAxis 
                            type="number" 
                            dataKey="ttk" 
                            name="TTK" 
                            unit="s" 
                            stroke="#737373"
                            domain={['auto', 'auto']}
                          >
                             <Label value="TTK (s)" angle={-90} position="insideLeft" fill="#737373" />
                          </YAxis>
                          <Tooltip 
                            cursor={{ strokeDasharray: '3 3' }}
                            contentStyle={{ backgroundColor: "#171717", border: "1px solid #262626", borderRadius: "8px" }}
                            itemStyle={{ color: "#e5e5e5" }}
                            labelStyle={{ display: "none" }}
                            formatter={(value: any, name: any, props: any) => {
                                if (name === "TTK") return [`${value.toFixed(3)}s`, "TTK"];
                                if (name === "Accuracy") return [`${value.toFixed(1)}%`, "Accuracy"];
                                return [value, name];
                            }}
                          />
                          <Scatter 
                            name="Runs" 
                            data={currentScenarioData} 
                            fill="#ec4899" 
                          />
                        </ScatterChart>
                      ) : (
                        <LineChart data={currentScenarioData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                          <XAxis dataKey="date" hide />
                          {currentMetric === 'fatigue' && (
                             <ReferenceLine y={100} stroke="#404040" strokeDasharray="3 3" label={{ position: 'top', value: 'Perfect Pacing', fill: '#666', fontSize: 10 }} />
                          )}
                          <YAxis 
                              stroke="#525252" 
                              domain={['auto', 'auto']} 
                              width={40} 
                              tick={{fontSize: 12}} 
                              tickFormatter={(val) => val.toLocaleString()}
                          />
                          <Tooltip 
                            contentStyle={{ backgroundColor: "#171717", border: "1px solid #262626", borderRadius: "8px" }}
                            itemStyle={{ color: "#e5e5e5" }}
                            labelStyle={{ display: "none" }}
                            formatter={(value: any) => [
                                typeof value === 'number' ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : value, 
                                getMetricLabel(currentMetric)
                            ]}
                          />
                          <Line
                            type="monotone"
                            dataKey={currentMetric}
                            stroke={getMetricColor()}
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 6, strokeWidth: 0 }}
                            animationDuration={500}
                          />
                        </LineChart>
                      )}
                    </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-neutral-600">
                    Select a scenario to view data
                  </div>
                )}
              </div>

              {/* Stats Summary */}
              {selectedScenario && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="bg-neutral-900/50 border border-neutral-800 p-4 rounded-xl">
                     <div className="flex items-center gap-2 mb-2 text-neutral-400">
                       <Crosshair className="w-4 h-4" />
                       <span className="text-xs font-bold uppercase tracking-wider">Avg Acc</span>
                     </div>
                     <p className="text-xl md:text-2xl font-mono font-bold text-white">
                       {calculateAverage(currentScenarioData.map(s => s.accuracy)).toFixed(1)}%
                     </p>
                  </div>
                  <div className="bg-neutral-900/50 border border-neutral-800 p-4 rounded-xl">
                     <div className="flex items-center gap-2 mb-2 text-neutral-400">
                       <Timer className="w-4 h-4" />
                       <span className="text-xs font-bold uppercase tracking-wider">Avg TTK</span>
                     </div>
                     <p className="text-xl md:text-2xl font-mono font-bold text-white">
                       {calculateAverage(currentScenarioData.map(s => s.ttk)).toFixed(3)}s
                     </p>
                  </div>
                  <div className="bg-neutral-900/50 border border-neutral-800 p-4 rounded-xl">
                     <div className="flex items-center gap-2 mb-2 text-neutral-400">
                       <BatteryCharging className="w-4 h-4" />
                       <span className="text-xs font-bold uppercase tracking-wider">Stamina</span>
                     </div>
                     <div className="flex items-end gap-2">
                        <p className={`text-xl md:text-2xl font-mono font-bold ${avgStamina >= 95 ? 'text-emerald-400' : avgStamina >= 85 ? 'text-yellow-400' : 'text-red-400'}`}>
                           {avgStamina.toFixed(0)}%
                        </p>
                     </div>
                  </div>
                  <div className="bg-neutral-900/50 border border-neutral-800 p-4 rounded-xl">
                     <div className="flex items-center gap-2 mb-2 text-neutral-400">
                       <Monitor className="w-4 h-4" />
                       <span className="text-xs font-bold uppercase tracking-wider">Avg FPS</span>
                     </div>
                     <p className="text-xl md:text-2xl font-mono font-bold text-white">
                       {Math.round(calculateAverage(currentScenarioData.map(s => s.fps)))}
                     </p>
                  </div>
                   <div className="bg-neutral-900/50 border border-neutral-800 p-4 rounded-xl">
                     <div className="flex items-center gap-2 mb-2 text-neutral-400">
                       <Activity className="w-4 h-4" />
                       <span className="text-xs font-bold uppercase tracking-wider">Total Runs</span>
                     </div>
                     <p className="text-xl md:text-2xl font-mono font-bold text-white">
                       {currentScenarioData.length}
                     </p>
                  </div>
                </div>
              )}

              {/* Personal Bests Table (Always shows Score PBs) */}
              {selectedScenario && (
                <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Trophy className="w-4 h-4 text-yellow-500" />
                    <h4 className="text-sm font-bold text-neutral-300 uppercase tracking-wider">Top 5 Records (By Score)</h4>
                  </div>
                  <div className="space-y-2">
                    {personalBests.map((run, idx) => (
                      <div key={run.id} className="flex justify-between items-center bg-neutral-950/50 px-4 py-3 rounded-lg border border-neutral-800/50 hover:border-neutral-700 transition-colors">
                        <div className="flex items-center gap-4">
                          <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded ${
                            idx === 0 ? 'bg-yellow-500/20 text-yellow-500' : 'bg-neutral-800 text-neutral-600'
                          }`}>
                            #{idx + 1}
                          </span>
                          <span className="text-neutral-400 text-sm font-mono">
                             {run.date.split("T")[0]}
                          </span>
                        </div>
                        <div className="flex items-center gap-6">
                            <span className="text-xs text-neutral-500 font-mono hidden md:block">
                                {run.accuracy.toFixed(1)}% Acc
                            </span>
                             <span className={`text-xs font-mono hidden md:block ${run.fatigue < 90 ? 'text-red-400' : 'text-emerald-400'}`}>
                                {run.fatigue > 0 ? `${run.fatigue.toFixed(0)}% Stm` : '-'}
                            </span>
                            <span className="font-mono text-white font-bold w-20 text-right">{run.score.toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
