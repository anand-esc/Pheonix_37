import React, { createContext, useContext, useReducer } from "react";

export const ROLES = [
  { id: "investigator-01", label: "Investigator", badge: "bg-[var(--accent-amber-dim)] text-[var(--accent-amber)] border border-[rgba(240,169,58,0.2)]" },
  { id: "technical-expert-01", label: "Technical Expert", badge: "bg-[var(--accent-cyan-dim)] text-[var(--accent-cyan)] border border-[rgba(62,214,196,0.2)]" },
  { id: "auditor-01", label: "Auditor", badge: "bg-[rgba(129,140,248,0.1)] text-[#818CF8] border border-[rgba(129,140,248,0.2)]" },
  { id: "court-export-01", label: "Court / Export", badge: "bg-[var(--accent-green-dim)] text-[var(--accent-green)] border border-[rgba(52,211,153,0.2)]" },
];

const initialState = {
  role: "investigator-01",
};

function roleReducer(state, action) {
  switch (action.type) {
    case "SET_ROLE":
      return { ...state, role: action.payload };
    default:
      return state;
  }
}

const RoleContext = createContext();

export function RoleProvider({ children }) {
  const [state, dispatch] = useReducer(roleReducer, initialState);

  const setRole = (role) => {
    dispatch({ type: "SET_ROLE", payload: role });
  };

  return (
    <RoleContext.Provider value={{ role: state.role, setRole, dispatch }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const context = useContext(RoleContext);
  if (!context) {
    throw new Error("useRole must be used within RoleProvider");
  }
  return context;
}