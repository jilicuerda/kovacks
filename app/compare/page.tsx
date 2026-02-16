"use client";
import React, { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { Users, BarChart2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function ComparePage() {
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [comparisonData, setComparisonData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // 1. Fetch all users to populate the dropdown
  useEffect(() => {
    const fetchUsers = async () => {
      const { data } = await supabase.from('profiles').select('id, username');
      if (data) setUsers(data);
      setLoading(false);
    };
    fetchUsers();
  }, []);

  // 2. Fetch stats when users are selected
  useEffect(() => {
    if (selectedUsers.length === 0) {
      setComparisonData([]);
      return;
    }

    const fetchStats = async () => {
      // Get scores for selected users
      const { data: scores } = await supabase
        .from('scores')
        .select('user_id, scenario, score, profiles(username)')
        .in('user_id', selectedUsers);

      if (!scores) return;

      // Process data for Chart (Group by Scenario)
      // Format: { name: "Scenario A", User1: 1000, User2: 1200 }
      const processed: any = {};
      
      scores.forEach((run: any) => {
        if (!processed[run.scenario]) processed[run.scenario] = { name: run.scenario };
        const username = run.profiles.username || 'Unknown';
        // Keep the highest score for each user per scenario
        if (!processed[run.scenario][username] || run.score > processed[run.scenario][username]) {
           processed[run.scenario][username] = run.score;
        }
      });

      setComparisonData(Object.values(processed));
    };

    fetchStats();
  }, [selectedUsers]);

  const toggleUser = (id: string) => {
    if (selectedUsers.includes(id)) {
      setSelectedUsers(selectedUsers.filter(u => u !== id));
    } else {
      setSelectedUsers([...selectedUsers, id]);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="flex items-center gap-3 border-b border-neutral-800 pb-6">
          <Users className="w-8 h-8 text-purple-500" />
          <h1 className="text-3xl font-bold">Player Comparison</h1>
        </header>

        {/* User Selector */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {users.map(u => (
            <button
              key={u.id}
              onClick={() => toggleUser(u.id)}
              className={`p-4 rounded-lg border text-left transition-all ${
                selectedUsers.includes(u.id) 
                  ? 'bg-purple-900/30 border-purple-500 text-white' 
                  : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:border-neutral-600'
              }`}
            >
              <div className="font-bold">{u.username || 'Unnamed'}</div>
              <div className="text-xs text-neutral-500">ID: {u.id.slice(0,4)}...</div>
            </button>
          ))}
        </div>

        {/* Chart */}
        {comparisonData.length > 0 ? (
          <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-xl h-[500px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comparisonData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="name" stroke="#888" />
                <YAxis stroke="#888" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#000', border: '1px solid #333' }}
                />
                <Legend />
                {selectedUsers.map((userId, index) => {
                  const user = users.find(u => u.id === userId);
                  const colors = ["#8884d8", "#82ca9d", "#ffc658", "#ff7300"];
                  return (
                    <Bar 
                      key={userId} 
                      dataKey={user?.username} 
                      fill={colors[index % colors.length]} 
                    />
                  );
                })}
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="text-center text-neutral-500 py-20">
            Select players above to compare their high scores.
          </div>
        )}
      </div>
    </div>
  );
}
