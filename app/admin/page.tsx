"use client";
import React, { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { Shield, UserPlus, Users, CheckCircle } from "lucide-react";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function AdminPanel() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Form State
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState(""); // New Field
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    checkAdmin();
  }, []);

  const checkAdmin = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      
      if (profile?.role === 'admin') setIsAdmin(true);
    }
    setLoading(false);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("Creating user...");

    // Sign up with extra metadata (Username)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username: username } // This gets sent to the database trigger
      }
    });

    if (error) {
      setMessage(`Error: ${error.message}`);
    } else {
      setMessage(`Success! Agent ${username} created.`);
      setEmail("");
      setUsername("");
      setPassword("");
    }
  };

  if (loading) return <div className="p-10 text-white">Checking permissions...</div>;
  if (!isAdmin) return <div className="text-white p-10">Access Denied</div>;

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="border-b border-neutral-800 pb-6 flex items-center gap-4">
          <div className="p-3 bg-red-600 rounded-lg">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Admin Command Center</h1>
            <p className="text-neutral-400">Manage Agents & Data</p>
          </div>
        </header>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-xl space-y-4">
            <div className="flex items-center gap-2 text-xl font-bold">
              <UserPlus className="text-blue-500" />
              <h2>Create New Agent</h2>
            </div>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-sm text-neutral-400 mb-1">Username</label>
                <input 
                  type="text" 
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-700 rounded p-2 focus:border-blue-500 outline-none"
                  placeholder="AgentName"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-neutral-400 mb-1">Email</label>
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-700 rounded p-2 focus:border-blue-500 outline-none"
                  placeholder="agent@kovaaks.com"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-neutral-400 mb-1">Password</label>
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-700 rounded p-2 focus:border-blue-500 outline-none"
                  placeholder="Secure Password"
                  required
                />
              </div>
              <button className="w-full bg-blue-600 hover:bg-blue-500 py-2 rounded font-bold transition-colors">
                Create Account
              </button>
              {message && <p className="text-sm text-yellow-400 text-center">{message}</p>}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
