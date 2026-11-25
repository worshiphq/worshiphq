import { DialogHost } from "./components/Dialogs";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ProjectionWindow } from "./components/ProjectionWindow";
import { StageWindow } from "./components/StageWindow";
import { ObsWindow } from "./components/ObsWindow";
import { SafetyNet } from "./components/SafetyNet";
import { startAppearance } from "./lib/appearance";
import "./styles.css";

const route = window.location.hash;
if (!["#projection", "#stage", "#obs"].includes(route)) startAppearance();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SafetyNet quiet={route === "#projection" || route === "#stage" || route === "#obs"}>
      {route === "#projection" ? <ProjectionWindow /> : route === "#stage" ? <StageWindow /> : route === "#obs" ? <ObsWindow /> : <><App /><DialogHost /></>}
    </SafetyNet>
  </React.StrictMode>,
);
