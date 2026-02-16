"use client";

import React, { useState, useCallback, useMemo, useEffect } from "react";
import Papa from "papaparse";
import _ from "lodash";
import { createClient } from "@supabase/supabase-js";
import {
  LineChart, Line, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Label
} from "recharts";
import { 
  UploadCloud, FileText, TrendingUp, Trophy, 
  Crosshair, Timer, Monitor, Activity, BatteryCharging, Shuffle, LogIn, LogOut, Cloud
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
    // We sign up with metadata (username) if we want, but simple email is fine for now
    const { error } = await supabase.auth.signUp({ 
      email, 
      password,
      options: {
        // This helps the database trigger we made earlier find a username
        data: { username: email.split('@')[0] } 
      }
    });
    if (error) alert(error.message);
    else {
      alert("Account created! You are now logged in.");
      setShowLogin(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  // --- 4. DATA SYNC LOGIC (NEW FEATURE) ---
  const handleSync = async () => {
    if (!user) return alert("Please log in to sync stats.");
    if (_.isEmpty(stats)) return alert("No stats to sync! Upload some CSV files first.");

    setIsSyncing(true);
    
    // Flatten the 'stats' object into a single array of rows for the database
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
          // Ensure we have a valid date, or use 'now'
          played_at: run.date && !isNaN(Date.parse(run.date)) ? run.date : new Date().toISOString()
        });
      });
    });

    // Send to Supabase
    const { error } = await supabase.from('scores').insert(scoresToUpload);
    
    if (error) {
      console.error(error);
      alert("Sync failed: " + error.message);
    } else {
      alert(`Success! Synced ${scoresToUpload.length} scores to the cloud.`);
    }
    
    setIsSyncing(false);
  };

  // --- 5. FILE PARSING LOGIC ---
  const processFiles = (files: File[]) => {
    setIsProcessing(true);
    const results: ParsedResults = {};
    let processedCount = 0;

    files.forEach(file => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (result) => {
          result.data.forEach((row: any) => {
            const scenario = row['Scenario Name'];
            if (!scenario) return;

            if (!results[scenario]) results[scenario] = [];

            results[scenario].push({
              id: Math.random().toString(36).substr(2, 9),
              date: row['Date and Time'] || new Date().toISOString(),
              score: parseFloat(row['Score']) || 0,
              scenario: scenario,
              accuracy: parseFloat(row['Accuracy']) || 0,
              ttk: parseFloat(row['Time To Kill']) || 0,
              fps: parseFloat(row['Avg FPS']) || 0,
              fatigue: 0 
            });
          });

          processedCount++;
          if (processedCount === files.length) {
            // Sort by date
            Object.keys(results).forEach(key => {
              results[key].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            });
            setStats(prev => ({ ...prev, ...results }));
            setIsProcessing(false);
          }
        }
      });
    });
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.csv'));
    if (files.length > 0) processFiles(files);
  }, []);

  // --- 6. RENDER HELPERS ---
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
          <div className="flex items-center gap-2">
            <Activity className="w-6 h-6 text-yellow-500" />
            <span className="font-bold text-xl tracking-tight">KOVA<span className="text-yellow-500">AKS</span>.PRO</span>
          </div>
          <div className="flex items-center gap-4">
             {/* Admin Link (Only visible if you know it exists, or we can hide it conditionally) */}
            {user && (
                 <a href="/admin" className="text-sm text-neutral-400 hover:text-white transition-colors">Admin Panel</a>
            )}
            
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
                onClick={() => setShowLogin(true)}
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
          <div 
            onDrop={onDrop}
            onDragOver={(e) => e.preventDefault()}
            className="p-12 text-center space-y-4 cursor-pointer"
          >
            <div className="w-16 h-16 bg-neutral-800 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
              <UploadCloud className="w-8 h-8 text-yellow-500" />
            </div>
            <h2 className="text-2xl font-bold">Drop KovaaKs CSVs Here</h2>
            <p className="text-neutral-400 max-w-md mx-auto">
              Drag and drop your stats folder. We analyze Score, Accuracy, TTK, and Fatigue locally.
            </p>
            {isProcessing && (
              <div className="text-yellow-500 font-mono animate-pulse">
                Processing {Object.keys(stats).length} scenarios...
              </div>
            )}
          </div>
        </section>

        {/* --- NEW SYNC BUTTON SECTION --- */}
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
            
            {/* SIDEBAR: Scenario List */}
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

            {/* MAIN CHART AREA */}
            <section className="lg:col-span-3 space-y-6">
              {selectedScenario ? (
                <>
                  {/* KPI CARDS */}
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

                  {/* CHART CONTAINER */}
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

      {/* LOGIN MODAL */}
      {showLogin && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 w-full max-w-md shadow-2xl">
            <h2 className="text-2xl font-bold mb-6 text-center">Account Access</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-neutral-400 mb-1">Email</label>
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-700 rounded-lg p-3 focus:border-yellow-500 outline-none transition-colors"
                  placeholder="name@example.com"
                />
              </div>
              <div>
                <label className="block text-sm text-neutral-400 mb-1">Password</label>
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-700 rounded-lg p-3 focus:border-yellow-500 outline-none transition-colors"
                  placeholder="••••••••"
                />
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button 
                  onClick={handleLogin}
                  className="bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-lg font-bold transition-colors"
                >
                  Log In
                </button>
                <button 
                  onClick={handleSignUp}
                  className="bg-neutral-800 hover:bg-neutral-700 text-white py-3 rounded-lg font-bold transition-colors"
                >
                  Sign Up
                </button>
              </div>
              <button 
                onClick={() => setShowLogin(false)}
                className="w-full text-neutral-500 text-sm hover:text-white mt-4"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// Simple Subcomponent for KPI Cards
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
