"use client";

import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import Papa from "papaparse";
import _ from "lodash";
import Link from "next/link"; 
import { createClient } from "@supabase/supabase-js";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";
import { 
  UploadCloud, FileText, TrendingUp, Trophy, 
  Crosshair, Activity, LogIn, LogOut, Cloud, User, BarChart2, Shield
} from "lucide-react";

// --- 1. DATABASE CONNECTION ---
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
  const [username, setUsername] = useState("");
  const [isSignUpMode, setIsSignUpMode] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // REF for file input
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSignUpMode) {
      if (!username) return alert("Please enter a username.");
      const { error } = await supabase.auth.signUp({ 
        email, 
        password,
        options: { data: { username: username } }
      });
      if (error) alert(error.message);
      else {
        alert("Account created successfully! You are logged in.");
        setShowLogin(false);
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) alert(error.message);
      else setShowLogin(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  // --- 4. DATA SYNC LOGIC ---
  const handleSync = async () => {
    if (!user) return alert("Please log in to sync stats.");
    if (_.isEmpty(stats)) return alert("No stats to sync! Upload some CSV files first.");

    setIsSyncing(true);
    
    const scoresToUpload: any[] = [];
    Object.values(stats).forEach((scenarioRuns) => {
      scenarioRuns.forEach((run) => {
        scoresToUpload.push({
          user_id: user.id,
          scenario: run.scenario,
          score: run.score,
          accuracy: run.accuracy,
          ttk: run.ttk,
          fps: run.fps,
          fatigue: run.fatigue,
          played_at: run.date 
        });
      });
    });

    const { error } = await supabase.from('scores').insert(scoresToUpload);
    
    if (error) {
      console.error(error);
      alert("Sync failed: " + error.message);
    } else {
      alert(`Success! Synced ${scoresToUpload.length} scores to the cloud.`);
    }
    setIsSyncing(false);
  };

  // --- 5. FILE PARSING LOGIC (HYBRID TEXT PARSER) ---
  const processFiles = async (files: File[]) => {
    console.log(`Starting to process ${files.length} files...`);
    setIsProcessing(true);
    const results: ParsedResults = {};
    let processedCount = 0;

    if (files.length === 0) {
        setIsProcessing(false);
        return;
    }

    const finalize = () => {
        Object.keys(results).forEach(key => {
            results[key].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        });
        console.log("Parsed Stats Final:", results);
        setStats(prev => ({ ...prev, ...results }));
        setIsProcessing(false);
    };

    for (const file of files) {
        try {
            // Read file as raw text first
            const text = await file.text();
            
            // CHECK 1: Is this a "Detailed Stats" file? (Look for keywords at start)
            if (text.startsWith('Kill #') || text.includes('Kill #,Timestamp')) {
                // --- STRATEGY: REGEX PARSING (Ignores broken CSV structure) ---
                
                // Extract Scenario
                // Matches: "Scenario:,PulseShot" or "Scenario: PulseShot"
                const scenarioMatch = text.match(/Scenario:[,;\s]+(.+)/i);
                const scenario = scenarioMatch ? scenarioMatch[1].trim() : null;

                // Extract Score
                // Matches: "Score:,888.5" or "Score:,888,5" (French)
                const scoreMatch = text.match(/Score:[,;\s]+([\d\.,]+)/i);
                const rawScore = scoreMatch ? scoreMatch[1].replace(',', '.') : '0';
                const score = parseFloat(rawScore);

                // Extract Accuracy components
                const hitsMatch = text.match(/Hit Count:[,;\s]+(\d+)/i);
                const missMatch = text.match(/Miss Count:[,;\s]+(\d+)/i);
                const hits = hitsMatch ? parseInt(hitsMatch[1]) : 0;
                const misses = missMatch ? parseInt(missMatch[1]) : 0;
                let accuracy = 0;
                if (hits + misses > 0) accuracy = hits / (hits + misses);

                // Extract TTK / FPS
                const ttkMatch = text.match(/Avg TTK:[,;\s]+([\d\.,]+)/i);
                const fpsMatch = text.match(/Avg FPS:[,;\s]+([\d\.,]+)/i);
                const ttk = ttkMatch ? parseFloat(ttkMatch[1].replace(',', '.')) : 0;
                const fps = fpsMatch ? parseFloat(fpsMatch[1].replace(',', '.')) : 0;

                // Extract Date from Filename (Most reliable source)
                // Ex: "PulseShot ... - 2025.11.03-20.05.18 Stats.csv"
                let date = new Date().toISOString();
                const nameMatch = file.name.match(/(\d{4}\.\d{2}\.\d{2}).*?(\d{2}\.\d{2}\.\d{2})/);
                if (nameMatch) {
                   const datePart = nameMatch[1].replace(/\./g, '-'); 
                   const timePart = nameMatch[2].replace(/\./g, ':'); 
                   const isoString = `${datePart}T${timePart}`;       
                   if (!isNaN(Date.parse(isoString))) date = isoString;
                }

                if (scenario && !isNaN(score)) {
                  if (!results[scenario]) results[scenario] = [];
                  results[scenario].push({
                    id: Math.random().toString(36).substr(2, 9),
                    date: date,
                    score: score,
                    scenario: scenario,
                    accuracy: accuracy,
                    ttk: ttk,
                    fps: fps,
                    fatigue: 0 
                  });
                }
            } 
            else {
                // --- STRATEGY: STANDARD CSV PARSING (For Summary files) ---
                Papa.parse(text, {
                    header: true,
                    skipEmptyLines: true,
                    complete: (parseResult) => {
                        const rows = parseResult.data as any[];
                        rows.forEach((row) => {
                            const scenarioName = row['Scenario Name'] || row['Scenario'];
                            if (!scenarioName) return;

                            const rawScore = row['Score'];
                            const score = parseFloat((rawScore || '0').replace(',', '.'));
                            const dateStr = row['Date and Time'];

                            if (!results[scenarioName]) results[scenarioName] = [];
                            results[scenarioName].push({
                                id: Math.random().toString(36).substr(2, 9),
                                date: dateStr || new Date().toISOString(),
                                score: score,
                                scenario: scenarioName,
                                accuracy: parseFloat((row['Accuracy'] || '0').replace(',', '.')),
                                ttk: parseFloat((row['Time To Kill'] || '0').replace(',', '.')),
                                fps: parseFloat((row['Avg FPS'] || '0').replace(',', '.')),
                                fatigue: 0
                            });
                        });
                    }
                });
            }
        } catch (err) {
            console.error(`Error parsing ${file.name}:`, err);
        } finally {
            processedCount++;
            if (processedCount % 50 === 0) console.log(`Processed ${processedCount}/${files.length}`);
            if (processedCount === files.length) finalize();
        }
    }
  };

  // --- 6. EVENT HANDLERS ---
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer.files).filter(f => 
        f.name.toLowerCase().endsWith('.csv')
    );
    if (files.length > 0) processFiles(files);
    else alert("No CSV files found.");
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
        const files = Array.from(e.target.files).filter(f => 
            f.name.toLowerCase().endsWith('.csv')
        );
        processFiles(files);
    }
  };

  // --- 7. RENDER HELPERS ---
  const chartData = useMemo(() => {
    if (!selectedScenario || !stats[selectedScenario]) return [];
    return stats[selectedScenario].map(pt => ({
      ...pt,
      formattedDate: new Date(pt.date).toLocaleDateString()
    }));
  }, [stats, selectedScenario]);

  return (
    <div className="min-h-screen bg-neutral-950 text-white font-sans selection:bg-yellow-500/30">
      
      {/* NAVBAR */}
      <nav className="border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <Activity className="w-6 h-6 text-yellow-500" />
            <span className="font-bold text-xl tracking-tight">KOVA<span className="text-yellow-500">AKS</span>.PRO</span>
          </Link>

          {/* NAVIGATION LINKS */}
          <div className="hidden md:flex items-center gap-6">
            <Link href="/" className="text-sm font-bold text-white border-b-2 border-yellow-500 pb-1">
              Dashboard
            </Link>
            <Link href="/leaderboard" className="text-sm font-medium text-neutral-400 hover:text-white transition-colors flex items-center gap-2">
              <Trophy className="w-4 h-4" /> Leaderboard
            </Link>
            <Link href="/compare" className="text-sm font-medium text-neutral-400 hover:text-white transition-colors flex items-center gap-2">
              <BarChart2 className="w-4 h-4" /> Compare
            </Link>
            {user && (
                <Link href="/admin" className="text-sm font-medium text-neutral-400 hover:text-red-400 transition-colors flex items-center gap-2">
                    <Shield className="w-4 h-4" /> Admin
                </Link>
            )}
          </div>

          {/* User Auth */}
          <div className="flex items-center gap-4">
            {user ? (
              <div className="flex items-center gap-4">
                <span className="text-sm text-neutral-400 hidden md:block">
                  {user.email}
                </span>
                <button 
                  onClick={handleLogout}
                  className="p-2 hover:bg-neutral-800 rounded-full transition-colors"
                  title="Logout"
                >
                  <LogOut className="w-5 h-5 text-red-400" />
                </button>
              </div>
            ) : (
              <button 
                onClick={() => { setShowLogin(true); setIsSignUpMode(false); }}
                className="flex items-center gap-2 bg-neutral-800 hover:bg-neutral-700 px-4 py-2 rounded-lg text-sm font-medium transition-all"
              >
                <LogIn className="w-4 h-4" />
                Login / Signup
              </button>
            )}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        
        {/* HERO / UPLOAD SECTION */}
        <section className="relative group rounded-2xl border-2 border-dashed border-neutral-800 bg-neutral-900/20 hover:border-yellow-500/50 transition-all duration-300">
          
          <input 
            type="file" 
            multiple 
            accept=".csv" 
            ref={fileInputRef} 
            onChange={handleFileSelect} 
            className="hidden" 
          />

          <div 
            onDrop={onDrop}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onClick={() => fileInputRef.current?.click()}
            className="p-12 text-center space-y-4 cursor-pointer"
          >
            <div className="w-16 h-16 bg-neutral-800 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
              <UploadCloud className="w-8 h-8 text-yellow-500" />
            </div>
            <h2 className="text-2xl font-bold">Drop KovaaKs CSVs Here</h2>
            <p className="text-neutral-400 max-w-md mx-auto">
              Drag & Drop your .CSV files here <br/>
              <span className="text-yellow-500 text-sm font-bold mt-2 inline-block">OR CLICK TO BROWSE</span>
            </p>
            {isProcessing && (
              <div className="text-yellow-500 font-mono animate-pulse">
                Processing {fileInputRef.current?.files?.length || "files"}...
              </div>
            )}
          </div>
        </section>

        {/* SYNC BUTTON */}
        {!_.isEmpty(stats) && (
          <div className="flex justify-center -mt-4 animate-in fade-in slide-in-from-top-4">
            <button
              onClick={handleSync}
              disabled={isSyncing || !user}
              className={`flex items-center gap-3 px-8 py-3 rounded-xl font-bold shadow-lg transition-all transform hover:scale-105 ${
                user 
                  ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/20" 
                  : "bg-neutral-800 text-neutral-500 cursor-not-allowed"
              }`}
            >
              <Cloud className="w-5 h-5" />
              {isSyncing ? "Syncing..." : user ? "Sync Stats to Cloud" : "Login to Sync Stats"}
            </button>
          </div>
        )}

        {/* ANALYTICS DASHBOARD */}
        {!_.isEmpty(stats) && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
            {/* SIDEBAR */}
            <aside className="lg:col-span-1 bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden h-[600px] flex flex-col">
              <div className="p-4 border-b border-neutral-800 bg-neutral-900">
                <h3 className="font-bold flex items-center gap-2">
                  <Crosshair className="w-4 h-4 text-yellow-500" />
                  Scenarios ({Object.keys(stats).length})
                </h3>
              </div>
              <div className="overflow-y-auto flex-1 p-2 space-y-1 custom-scrollbar">
                {Object.keys(stats).map(name => (
                  <button
                    key={name}
                    onClick={() => setSelectedScenario(name)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm truncate transition-colors ${
                      selectedScenario === name 
                        ? 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20' 
                        : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </aside>

            {/* CHART AREA */}
            <section className="lg:col-span-3 space-y-6">
              {selectedScenario ? (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <MetricCard 
                      label="High Score" 
                      value={Math.max(...stats[selectedScenario].map(s => s.score)).toLocaleString()} 
                      icon={<Trophy className="w-4 h-4 text-yellow-500" />} 
                    />
                    <MetricCard 
                      label="Avg Accuracy" 
                      value={(_.meanBy(stats[selectedScenario], 'accuracy') * 100).toFixed(1) + '%'} 
                      icon={<Activity className="w-4 h-4 text-blue-500" />} 
                    />
                    <MetricCard 
                      label="Total Runs" 
                      value={stats[selectedScenario].length} 
                      icon={<FileText className="w-4 h-4 text-purple-500" />} 
                    />
                    <MetricCard 
                      label="Improvement" 
                      value={'+' + ((stats[selectedScenario][stats[selectedScenario].length-1].score - stats[selectedScenario][0].score) / stats[selectedScenario][0].score * 100).toFixed(1) + '%'} 
                      icon={<TrendingUp className="w-4 h-4 text-emerald-500" />} 
                    />
                  </div>

                  <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 h-[400px]">
                    <div className="flex justify-between items-center mb-6">
                      <h3 className="font-bold text-lg">{selectedScenario} Progress</h3>
                      <div className="flex gap-2 bg-neutral-950 p-1 rounded-lg border border-neutral-800">
                        {(['score', 'accuracy', 'fps'] as const).map(m => (
                          <button
                            key={m}
                            onClick={() => setCurrentMetric(m)}
                            className={`px-3 py-1 rounded text-xs font-bold uppercase ${
                              currentMetric === m ? 'bg-neutral-800 text-white' : 'text-neutral-500 hover:text-neutral-300'
                            }`}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>
                    
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                        <XAxis 
                          dataKey="formattedDate" 
                          stroke="#525252" 
                          tick={{fontSize: 12}} 
                          tickMargin={10} 
                        />
                        <YAxis 
                          stroke="#525252" 
                          tick={{fontSize: 12}} 
                          domain={['auto', 'auto']}
                        />
                        <Tooltip 
                          contentStyle={{backgroundColor: '#171717', border: '1px solid #404040', borderRadius: '8px'}}
                          itemStyle={{color: '#fff'}}
                        />
                        <Line 
                          type="monotone" 
                          dataKey={currentMetric} 
                          stroke="#eab308" 
                          strokeWidth={2} 
                          dot={{r: 3, fill: '#eab308'}} 
                          activeDot={{r: 6, fill: '#fff'}} 
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-neutral-500 border border-neutral-800 rounded-xl bg-neutral-900/50">
                  <Crosshair className="w-12 h-12 mb-4 opacity-20" />
                  <p>Select a scenario from the sidebar to view analysis</p>
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      {/* LOGIN / SIGNUP MODAL */}
      {showLogin && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 w-full max-w-md shadow-2xl animate-in zoom-in-95">
            <h2 className="text-2xl font-bold mb-6 text-center">
              {isSignUpMode ? "Create Account" : "Welcome Back"}
            </h2>
            
            <form onSubmit={handleAuth} className="space-y-4">
              
              {isSignUpMode && (
                <div>
                  <label className="block text-sm text-neutral-400 mb-1">Username</label>
                  <div className="relative">
                    <User className="w-5 h-5 absolute left-3 top-3 text-neutral-500" />
                    <input 
                      type="text" 
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-700 rounded-lg py-3 pl-10 pr-4 focus:border-yellow-500 outline-none transition-colors"
                      placeholder="KovaaksGod2024"
                      required
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm text-neutral-400 mb-1">Email</label>
                <div className="relative">
                  <Cloud className="w-5 h-5 absolute left-3 top-3 text-neutral-500" />
                  <input 
                    type="email" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-700 rounded-lg py-3 pl-10 pr-4 focus:border-yellow-500 outline-none transition-colors"
                    placeholder="name@example.com"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-neutral-400 mb-1">Password</label>
                <div className="relative">
                  <LogIn className="w-5 h-5 absolute left-3 top-3 text-neutral-500" />
                  <input 
                    type="password" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-700 rounded-lg py-3 pl-10 pr-4 focus:border-yellow-500 outline-none transition-colors"
                    placeholder="••••••••"
                    required
                  />
                </div>
              </div>

              <button 
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-lg font-bold transition-colors mt-2"
              >
                {isSignUpMode ? "Create Account" : "Log In"}
              </button>
            </form>

            <div className="mt-4 text-center text-sm">
              <span className="text-neutral-500">
                {isSignUpMode ? "Already have an account? " : "Don't have an account? "}
              </span>
              <button 
                type="button"
                onClick={() => setIsSignUpMode(!isSignUpMode)}
                className="text-yellow-500 hover:underline font-bold"
              >
                {isSignUpMode ? "Log In" : "Sign Up"}
              </button>
            </div>

            <button 
              onClick={() => setShowLogin(false)}
              className="w-full text-neutral-500 text-sm hover:text-white mt-6 pt-4 border-t border-neutral-800"
            >
              Close
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

function MetricCard({ label, value, icon }: { label: string, value: string | number, icon: React.ReactNode }) {
  return (
    <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl flex flex-col justify-between hover:border-neutral-700 transition-colors">
      <div className="text-neutral-500 text-xs font-bold uppercase tracking-wider mb-2 flex justify-between items-center">
        {label}
        {icon}
      </div>
      <div className="text-2xl font-mono font-bold text-white">{value}</div>
    </div>
  );
}
