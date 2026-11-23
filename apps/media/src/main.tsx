import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ProjectionWindow } from "./components/ProjectionWindow";
import { StageWindow } from "./components/StageWindow";
import { ObsWindow } from "./components/ObsWindow";
import "./styles.css";

const route = window.location.hash;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {route === "#projection" ? <ProjectionWindow /> : route === "#stage" ? <StageWindow /> : route === "#obs" ? <ObsWindow /> : <App />}
  </React.StrictMode>,
);
