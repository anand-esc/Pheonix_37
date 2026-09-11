import React, { useState } from "react";
import { Shield, Lock, Eye, EyeOff, Search, FileCheck, History, Scale, Check } from "lucide-react";
import { useRole } from "../context/RoleContext";

const ROLE_CONFIGS = [
  {
    id: "investigator-01",
    label: "Investigator",
    role: "INVESTIGATOR",
    pin: "inv2026",
    desc: "Evidence Intake & Carving",
    icon: Search,
  },
  {
    id: "technical-expert-01",
    label: "Technical Expert",
    role: "TECHNICAL_EXPERT",
    pin: "expert2026",
    desc: "BSA §63 Certification",
    icon: FileCheck,
  },
  {
    id: "auditor-01",
    label: "Auditor",
    role: "AUDITOR",
    pin: "audit2026",
    desc: "Ledger & Integrity Audit",
    icon: History,
  },
  {
    id: "court-export-01",
    label: "Court / Export",
    role: "COURT_EXPORT",
    pin: "court2026",
    desc: "Evidence Package Export",
    icon: Scale,
  },
];

export function LoginPage() {
  const { login } = useRole();
  const [operatorId, setOperatorId] = useState(ROLE_CONFIGS[0].id);
  const [password, setPassword] = useState(ROLE_CONFIGS[0].pin);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const currentRole = ROLE_CONFIGS.find((r) => r.id === operatorId) || ROLE_CONFIGS[0];

  const handleRoleSelect = (roleConfig) => {
    setOperatorId(roleConfig.id);
    setPassword(roleConfig.pin);
    setError("");
  };

  const handleLogin = (e) => {
    e.preventDefault();
    if (!password.trim()) {
      setError("Security PIN is required.");
      return;
    }

    // Role-specific password validation (with admin / ntro2026 universal overrides)
    if (
      password === currentRole.pin ||
      password === "ntro2026" ||
      password === "admin"
    ) {
      login(operatorId);
    } else {
      setError(`Invalid clearance PIN for ${currentRole.label}. Please enter the correct security clearance.`);
    }
  };

  return (
    <div className="min-h-screen bg-phx-surface flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white border border-phx-border rounded-2xl shadow-xl overflow-hidden">
        <div className="bg-phx-primary p-8 flex flex-col items-center text-white">
          <Shield size={44} className="text-phx-cyan mb-3" />
          <h1 className="text-2xl font-bold tracking-tight">Pheonix_37</h1>
          <p className="text-xs text-phx-muted mt-1 text-center">
            Digital Forensics & Evidence Toolkit • NTRO SIH26150
          </p>
        </div>

        <div className="p-7">
          <form onSubmit={handleLogin} className="flex flex-col gap-6">
            {error && (
              <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs font-medium">
                {error}
              </div>
            )}

            {/* Quick Role Selection Cards (No plaintext PINs visible) */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-phx-secondary uppercase tracking-wider">
                  Select Clearance Role
                </label>
                <span className="text-[11px] text-phx-muted">Authorized Personnel Only</span>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                {ROLE_CONFIGS.map((item) => {
                  const isSelected = operatorId === item.id;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleRoleSelect(item)}
                      className={`p-3 rounded-xl border text-left transition-all flex flex-col gap-1 cursor-pointer relative ${
                        isSelected
                          ? "bg-indigo-50/90 border-phx-cyan text-phx-primary shadow-xs ring-1 ring-phx-cyan"
                          : "bg-phx-surface hover:bg-zinc-100 border-phx-border text-phx-secondary"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 font-semibold text-xs text-phx-primary">
                          <Icon size={14} className={isSelected ? "text-phx-cyan" : "text-phx-muted"} />
                          <span className="truncate">{item.label}</span>
                        </div>
                        {isSelected && <Check size={14} className="text-phx-cyan stroke-[2.5]" />}
                      </div>
                      <span className="text-[10px] text-phx-muted font-mono">{item.role}</span>
                      <p className="text-[11px] text-phx-secondary mt-1 leading-tight line-clamp-1">
                        {item.desc}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Password / Security PIN Input */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-phx-secondary uppercase tracking-wider">
                  Security PIN for {currentRole.label}
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setPassword(currentRole.pin);
                    setError("");
                  }}
                  className="text-xs text-phx-cyan hover:underline font-medium cursor-pointer"
                >
                  Auto-fill Clearance PIN
                </button>
              </div>

              <div className="relative">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-phx-muted" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={`Enter PIN for ${currentRole.label}`}
                  className="w-full py-2.5 pl-10 pr-10 bg-phx-surface border border-phx-border rounded-lg focus:outline-none focus:border-phx-cyan focus:ring-1 focus:ring-phx-cyan text-phx-primary text-sm font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-phx-muted hover:text-phx-primary transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button type="submit" className="btn-primary py-3 text-sm font-semibold rounded-xl cursor-pointer">
              Login as {currentRole.label}
            </button>
          </form>
        </div>
      </div>

      <p className="text-xs text-phx-muted mt-6 text-center max-w-sm">
        WARNING: Strictly classified digital evidence repository. Unauthorized access is recorded in the immutable audit ledger under BSA Section 63.
      </p>
    </div>
  );
}
