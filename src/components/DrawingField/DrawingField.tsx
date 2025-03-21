import { Excalidraw } from "@excalidraw/excalidraw";
import { useEffect, useState } from "react";

function DrawingField() {
    const [elements, setElements] = useState(null);

    useEffect(() => {
        if (localStorage.getItem("excalidrawElements") !== null) {
            const elementJson = localStorage.getItem("excalidrawElements");
            const element = JSON.parse(elementJson);
            setElements(element);
        }
    }, []);
    return (
        <div style={{ height: "500px" }}>
            <Excalidraw
                initialData={{
                    elements: elements,
                    appState: { zenModeEnabled: false, viewBackgroundColor: "#acc1d1" },
                    scrollToContent: true,
                }}
                onChange={(excalidrawElements, appState, files) => {
                    localStorage.setItem("excalidrawElements", JSON.stringify(excalidrawElements));
                    localStorage.setItem("appState", JSON.stringify(appState));
                }}
            />
        </div>
    );
}
export default DrawingField;
