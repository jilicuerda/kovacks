"use client";
import React, { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { Trophy, TrendingUp, Search } from "lucide-react";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function Leaderboard() {
  const [scores, setScores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    fetchScores();
  }, []);

  const fetchScores = async () => {
    // Join 'scores' with 'profiles' to get the email/name of the user
    const { data, error } = await supabase
      .from('scores')
      .select('*, profiles(email)')
      .order('score', { ascending: false })
      .limit(50);

    if (data) setScores(data);
    setLoading(false);
  };

  const filteredScores = scores.filter(s => 
    s.scenario.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-6 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-6 border-b border-neutral-800">
           <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-600/20 rounded-lg">
              <Trophy className="w-8 h-8 text-yellow-500" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Global Leaderboards</h1>
              <p className="text-neutral-500">Compare your stats against the best</p>
            </div>
          </div>
          <div className="relative">
            <Search className="w-5 h-5 absolute left-3 top-3 text-neutral-500" />
            <input 
                type="text" 
                placeholder="Search scenario..." 
                className="bg-neutral-900 border border-neutral-800 rounded-full py-2 pl-10 pr-4 w-64 text-sm focus:border-yellow-500 outline-none transition-colors"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
            />
          </div>
        </div>

        {/* Table */}
        <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl overflow-hidden">
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="bg-neutral-900 text-neutral-400 text-sm uppercase tracking-wider">
                        <th className="p-4 font-medium">Rank</th>
                        <th className="p-4 font-medium">Player</th>
                        <th className="p-4 font-medium">Scenario</th>
                        <th className="p-4 font-medium text-right">Score</th>
                        <th className="p-4 font-medium text-right">Acc %</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                    {filteredScores.map((run, idx) => (
                        <tr key={run.id} className="hover:bg-neutral-800/50 transition-colors">
                            <td className="p-4">
                                <span className={`inline-flex items-center justify-center w-8 h-8 rounded font-bold ${
                                    idx === 0 ? 'bg-yellow-500 text-black' :
                                    idx === 1 ? 'bg-neutral-400 text-black' :
                                    idx === 2 ? 'bg-orange-700 text-white' :
                                    'text-neutral-500 bg-neutral-800'
                                }`}>
                                    {idx + 1}
                                </span>
                            </td>
                            <td className="p-4 text-neutral-300 font-medium">
                                {run.profiles?.email?.split('@')[0] || 'Unknown'}
                            </td>
                            <td className="p-4 text-neutral-400 text-sm">
                                {run.scenario}
                            </td>
                            <td className="p-4 text-right font-mono font-bold text-white text-lg">
                                {run.score.toLocaleString()}
                            </td>
                            <td className="p-4 text-right font-mono text-emerald-400">
                                {run.accuracy?.toFixed(2)}%
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {filteredScores.length === 0 && (
                <div className="p-10 text-center text-neutral-500">No runs found.</div>
            )}
        </div>

      </div>
    </div>
  );
}
