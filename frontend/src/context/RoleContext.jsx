import React, { createContext, useContext, useReducer, useEffect } from "react";
import { OPERATORS, getOperatorRole, setOperatorId } from "../api";

const initialState = {
  operatorId: localStorage.getItem("phoenix_operator_id") || "investigator-01",
  isAuthenticated: sessionStorage.getItem("phoenix_auth") === "true",
};

function roleReducer(state, action) {
  switch (action.type) {
    case "SET_OPERATOR":
      return { ...state, operatorId: action.payload };
    case "SET_AUTH":
      return { ...state, isAuthenticated: action.payload };
    default:
      return state;
  }
}

const RoleContext = createContext();

export function RoleProvider({ children }) {
  const [state, dispatch] = useReducer(roleReducer, initialState);

  const setOperator = (operatorId) => {
    setOperatorId(operatorId);
    dispatch({ type: "SET_OPERATOR", payload: operatorId });
  };

  const login = (operatorId) => {
    setOperatorId(operatorId);
    sessionStorage.setItem("phoenix_auth", "true");
    dispatch({ type: "SET_OPERATOR", payload: operatorId });
    dispatch({ type: "SET_AUTH", payload: true });
  };

  const logout = () => {
    sessionStorage.removeItem("phoenix_auth");
    dispatch({ type: "SET_AUTH", payload: false });
  };

  const operator = OPERATORS.find(o => o.id === state.operatorId) || OPERATORS[0];
  const role = getOperatorRole();

  const can = (action) => {
    const roleActions = {
      INVESTIGATOR: ["VIEW_EVIDENCE", "EXPORT_BUNDLE", "TRIGGER_ACQUISITION"],
      TECHNICAL_EXPERT: ["VIEW_EVIDENCE", "EXPORT_BUNDLE", "TRIGGER_ACQUISITION", "RUN_DETECTION"],
      AUDITOR: ["VIEW_EVIDENCE", "EXPORT_BUNDLE", "VIEW_LEDGER"],
      COURT_EXPORT: ["VIEW_EVIDENCE", "EXPORT_BUNDLE", "GENERATE_CERTIFICATE"],
    };
    return roleActions[role]?.includes(action) ?? false;
  };

  return (
    <RoleContext.Provider value={{
      operatorId: state.operatorId,
      isAuthenticated: state.isAuthenticated,
      operator,
      role,
      setOperator,
      login,
      logout,
      can,
    }}>
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