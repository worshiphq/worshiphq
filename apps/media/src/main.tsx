import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ProjectionWindow } from "./components/ProjectionWindow";
import "./styles.css";

const isProjection = window.location.hash === "#projection";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isProjection ? <ProjectionWindow /> : <App />}
  </React.StrictMode>,
);
