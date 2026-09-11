import React, { useState } from "react";
import { Shield, Lock, Eye, EyeOff } from "lucide-react";
import { useRole } from "../context/RoleContext";
import { OPERATORS } from "../api";

export function LoginPage() {
  const { login } = useRole();
  const [operatorId, setOperatorId] = useState(OPERATORS[0].id);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = (e) => {
    e.preventDefault();
    if (!password.trim()) {
      setError("Password is required.");
      return;
    }
    // Hardcoded simple check for demo purposes
    if (password === "ntro2026" || password === "admin") {
      login(operatorId);
    } else {
      setError("Invalid password. Please try 'ntro2026' or 'admin'.");
    }
  };

  return (
    <div className="min-h-screen bg-phx-surface flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border border-phx-border rounded-xl shadow-lg overflow-hidden">
        <div className="bg-phx-primary p-8 flex flex-col items-center text-white">
          <Shield size={48} className="text-phx-cyan mb-4" />
          <h1 className="text-2xl font-bold tracking-tight">Pheonix_37</h1>
          <p className="text-sm text-phx-muted mt-2 text-center">
            Digital Forensics & Evidence Toolkit<br/>
            NTRO SIH26150
          </p>
        </div>
        
        <div className="p-8">
          <form onSubmit={handleLogin} className="flex flex-col gap-5">
            {error && (
              <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded text-sm font-medium">
                {error}
              </div>
            )}
            
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-phx-secondary uppercase tracking-wider">Operator ID</label>
              <select
                value={operatorId}
                onChange={(e) => setOperatorId(e.target.value)}
                className="w-full p-3 bg-phx-surface border border-phx-border rounded focus:outline-none focus:border-phx-cyan focus:ring-1 focus:ring-phx-cyan text-phx-primary cursor-pointer"
              >
                {OPERATORS.map((op) => (
                  <option key={op.id} value={op.id}>
                    {op.label} ({op.role})
                  </option>
                ))}
              </select>
            </div>
            
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-phx-secondary uppercase tracking-wider">Security PIN</label>
              <div className="relative">
                <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-phx-muted" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your clearance PIN"
                  className="w-full p-3 pl-10 pr-10 bg-phx-surface border border-phx-border rounded focus:outline-none focus:border-phx-cyan focus:ring-1 focus:ring-phx-cyan text-phx-primary"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-phx-muted hover:text-phx-primary transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            
            <button type="submit" className="btn-primary mt-2 py-3 text-base">
              Secure Login
            </button>
          </form>
        </div>
      </div>
      
      <p className="text-xs text-phx-muted mt-8 text-center max-w-sm">
        WARNING: This system contains strictly classified digital evidence. Unauthorized access is punishable under BSA Section 63.
      </p>
    </div>
  );
}
