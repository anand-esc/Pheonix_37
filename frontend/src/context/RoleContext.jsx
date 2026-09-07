import React, { createContext, useContext, useReducer } from "react";

export const ROLES = [
  { id: "Investigator", label: "Investigator", badge: "bg-blue-900/60 text-blue-300 border-blue-700/60" },
  { id: "Technical Expert", label: "Technical Expert", badge: "bg-purple-900/60 text-purple-300 border-purple-700/60" },
  { id: "Auditor", label: "Auditor", badge: "bg-amber-900/60 text-amber-300 border-amber-700/60" },
  { id: "Court", label: "Court / Export", badge: "bg-emerald-900/60 text-emerald-300 border-emerald-700/60" },
];

const initialState = {
  role: "Investigator",
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
    throw new Error("useRole must be used within a RoleProvider");
  }
  return context;
}
