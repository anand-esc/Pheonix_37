import React, { createContext, useContext, useReducer } from "react";
import { OPERATORS, ROLE_ACTIONS, getOperatorRole, setOperatorId } from "../api";

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

  const operator = OPERATORS.find((o) => o.id === state.operatorId) || OPERATORS[0];
  const role = getOperatorRole(state.operatorId);

  // Mirrors the backend RBAC matrix; the backend is still the authority and
  // answers 403 when a role lacks an action, this only shapes the UI.
  const can = (action) => ROLE_ACTIONS[role]?.includes(action) ?? false;

  return (
    <RoleContext.Provider
      value={{
        operatorId: state.operatorId,
        isAuthenticated: state.isAuthenticated,
        operator,
        role,
        setOperator,
        login,
        logout,
        can,
      }}
    >
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
