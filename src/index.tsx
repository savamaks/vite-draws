import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@excalidraw/excalidraw/index.css";

import type * as TExcalidraw from "@excalidraw/excalidraw";

import ExampleApp from "./components/ExampleApp";
import DrawingField from "./components/DrawingField/DrawingField";

declare global {
    interface Window {
        ExcalidrawLib: typeof TExcalidraw;
    }
}

const rootElement = document.getElementById("root")!;
const root = createRoot(rootElement);
const { Excalidraw } = window.ExcalidrawLib;
root.render(
    <StrictMode>
        <ExampleApp appTitle={"Draw"} useCustom={(api: any, args?: any[]) => {}} excalidrawLib={window.ExcalidrawLib}>
            <Excalidraw />
        </ExampleApp>
        {/* <DrawingField /> */}
    </StrictMode>
);
