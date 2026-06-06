import { BrowserRouter, Routes, Route, NavLink, useLocation } from "react-router-dom";
import "./App.css";
import SingleView from "./pages/SingleView.jsx";
import CycleView from "./pages/CycleView.jsx";
import BoardView from "./pages/BoardView.jsx";
import SuitcaseView from "./pages/SuitcaseView.jsx";
import { FLEET } from "./config/fleet.js";

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
  const smallLink = ({ isActive }) => ({
    ...linkStyle({ isActive }),
    padding: "6px 9px",
    letterSpacing: 1,
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
        flexWrap: "wrap",
        gap: 12,
      }}
    >
      <div style={{ color: "#fff", fontSize: 12, letterSpacing: 4 }}>
        CLEARANCE SYSTEM
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <NavLink to="/" end style={linkStyle}>
          SINGLE
        </NavLink>
        <NavLink to="/cycle" style={linkStyle}>
          CYCLE
        </NavLink>
        <NavLink to="/board" style={linkStyle}>
          BOARD
        </NavLink>
        <span style={{ color: "#333", fontSize: 10, letterSpacing: 2, marginLeft: 4 }}>
          SUITCASE
        </span>
        {FLEET.map((s) => (
          <NavLink key={s.suitcaseId} to={`/suitcase/${s.suitcaseId}`} style={smallLink}>
            #{s.suitcaseId}
          </NavLink>
        ))}
      </div>
    </div>
  );
}

function Layout({ children }) {
  const location = useLocation();
  // /board と /suitcase/* は会場ディスプレイ想定でフルスクリーン（ナビ無し）
  const isFullscreen =
    location.pathname === "/board" || location.pathname.startsWith("/suitcase/");
  return (
    <div
      style={{
        background: isFullscreen ? "#000" : "#050505",
        minHeight: "100vh",
        color: "#ccc",
        fontFamily: "monospace",
        boxSizing: "border-box",
      }}
    >
      {!isFullscreen && <NavBar />}
      <div style={{ padding: isFullscreen ? 0 : "24px" }}>{children}</div>
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
          <Route path="/suitcase/:id" element={<SuitcaseView />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
