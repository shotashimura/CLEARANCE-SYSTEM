import { BrowserRouter, Routes, Route, NavLink, useLocation } from "react-router-dom";
import "./App.css";
import SingleView from "./pages/SingleView.jsx";
import CycleView from "./pages/CycleView.jsx";
import BoardView from "./pages/BoardView.jsx";

function NavBar() {
  const linkStyle = ({ isActive }) => ({
    color: isActive ? "#fff" : "#666",
    background: isActive ? "#1a1a1a" : "transparent",
    border: `1px solid ${isActive ? "#444" : "#222"}`,
    padding: "6px 14px",
    fontFamily: "monospace",
    fontSize: 11,
    letterSpacing: 3,
    textDecoration: "none",
    transition: "all 0.15s",
  });
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 24px",
        borderBottom: "1px solid #1a1a1a",
        background: "#080808",
      }}
    >
      <div style={{ color: "#fff", fontSize: 12, letterSpacing: 4 }}>
        CLEARANCE SYSTEM
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <NavLink to="/" end style={linkStyle}>
          SINGLE
        </NavLink>
        <NavLink to="/cycle" style={linkStyle}>
          CYCLE
        </NavLink>
        <NavLink to="/board" style={linkStyle}>
          BOARD
        </NavLink>
      </div>
    </div>
  );
}

function Layout({ children }) {
  const location = useLocation();
  const isBoard = location.pathname === "/board";
  return (
    <div
      style={{
        background: isBoard ? "#000" : "#050505",
        minHeight: "100vh",
        color: "#ccc",
        fontFamily: "monospace",
        boxSizing: "border-box",
      }}
    >
      {!isBoard && <NavBar />}
      <div style={{ padding: isBoard ? 0 : "24px" }}>{children}</div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<SingleView />} />
          <Route path="/cycle" element={<CycleView />} />
          <Route path="/board" element={<BoardView />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
