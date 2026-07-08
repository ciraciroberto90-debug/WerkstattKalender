import "./storage.js";
import "./index.css";
import React from "react";
import { createRoot } from "react-dom/client";
import AppWithBoundary from "./WerkstattKalender.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppWithBoundary />
  </React.StrictMode>
);
