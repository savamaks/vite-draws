import React, { useEffect, useState, useRef, useCallback, Children, cloneElement } from "react";

import type * as TExcalidraw from "@excalidraw/excalidraw";
import type { ImportedLibraryData } from "@excalidraw/excalidraw/data/types";
import type { NonDeletedExcalidrawElement, Theme } from "@excalidraw/excalidraw/element/types";
import type {
    AppState,
    BinaryFileData,
    ExcalidrawImperativeAPI,
    ExcalidrawInitialDataState,
    Gesture,
    PointerDownState as ExcalidrawPointerDownState,
} from "@excalidraw/excalidraw/types";

import initialData from "./initialDate";
import { resolvablePromise, distance2d, fileOpen, withBatchedUpdates, withBatchedUpdatesThrottled } from "./utils";

import "./ExampleApp.scss";

import type { ResolvablePromise } from "./utils";

type Comment = {
    x: number;
    y: number;
    value: string;
    id?: string;
};

type PointerDownState = {
    x: number;
    y: number;
    hitElement: Comment;
    onMove: any;
    onUp: any;
    hitElementOffsets: {
        x: number;
        y: number;
    };
};

export interface AppProps {
    appTitle: string;
    useCustom: (api: ExcalidrawImperativeAPI | null, customArgs?: any[]) => void;
    customArgs?: any[];
    children: React.ReactNode;
    excalidrawLib: typeof TExcalidraw;
}

export default function ExampleApp({ appTitle, useCustom, customArgs, children, excalidrawLib }: AppProps) {
    const {
        exportToBlob,
        useHandleLibrary,
        MIME_TYPES,
        viewportCoordsToSceneCoords,
        restoreElements,
        Footer,
        MainMenu,
        convertToExcalidrawElements, // конертирует картинку в канвас
        TTDDialog,
        TTDDialogTrigger,
        ROUNDNESS,
        loadSceneOrLibraryFromBlob,
    } = excalidrawLib;
    const appRef = useRef<any>(null);

    const [blobUrl, setBlobUrl] = useState<string>("");
    const [exportWithDarkMode, setExportWithDarkMode] = useState(false);
    const [exportEmbedScene, setExportEmbedScene] = useState(false);
    const [theme, setTheme] = useState<Theme>("light");
    const [disableImageTool, setDisableImageTool] = useState(false);
    const [commentIcons, setCommentIcons] = useState<{ [id: string]: Comment }>({});
    const [comment, setComment] = useState<Comment | null>(null);

    const initialStatePromiseRef = useRef<{
        promise: ResolvablePromise<ExcalidrawInitialDataState | null>;
    }>({ promise: null! });
    if (!initialStatePromiseRef.current.promise) {
        initialStatePromiseRef.current.promise = resolvablePromise<ExcalidrawInitialDataState | null>();
    }

    const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);

    useCustom(excalidrawAPI, customArgs);

    useHandleLibrary({ excalidrawAPI });

    useEffect(() => {
        if (!excalidrawAPI) {
            return;
        }
        const fetchData = async () => {
            const res = await fetch("/images/rocket.jpeg");
            const imageData = await res.blob();
            const reader = new FileReader();
            reader.readAsDataURL(imageData);

            reader.onload = function () {
                const imagesArray: BinaryFileData[] = [
                    {
                        id: "rocket" as BinaryFileData["id"],
                        dataURL: reader.result as BinaryFileData["dataURL"],
                        mimeType: MIME_TYPES.jpg,
                        created: 1644915140367,
                        lastRetrieved: 1644915140367,
                    },
                ];

                //@ts-ignore
                initialStatePromiseRef.current.promise.resolve({
                    ...initialData,
                    elements: convertToExcalidrawElements(initialData.elements),
                });
                excalidrawAPI.addFiles(imagesArray);
            };
        };
        fetchData();
    }, [excalidrawAPI, convertToExcalidrawElements, MIME_TYPES]);

    const renderExcalidraw = (children: React.ReactNode) => {
        const Excalidraw: any = Children.toArray(children).find(
            (child) =>
                React.isValidElement(child) &&
                typeof child.type !== "string" &&
                //@ts-ignore
                child.type.displayName === "Excalidraw"
        );
        if (!Excalidraw) {
            return;
        }
        const newElement = cloneElement(
            Excalidraw,
            {
                excalidrawAPI: (api: ExcalidrawImperativeAPI) => setExcalidrawAPI(api),
                initialData: initialStatePromiseRef.current.promise,
                onChange: (elements: NonDeletedExcalidrawElement[], state: AppState) => {
                    console.info("Elements :", elements, "State : ", state);
                },
                onPointerUpdate: (payload: { pointer: { x: number; y: number }; button: "down" | "up"; pointersMap: Gesture["pointers"] }) =>
                    setPointerData(payload),

                theme,
                name: "Custom name of drawing",
                UIOptions: {
                    canvasActions: {
                        loadScene: false,
                        changeViewBackgroundColor: true,
                    },
                    tools: { image: !disableImageTool },
                },
                // onLinkOpen,
                // onPointerDown,
                validateEmbeddable: true,
            },
            <>
                {excalidrawAPI && <Footer></Footer>}

                {renderMenu()}
            </>
        );
        return newElement;
    };

    const onLinkOpen = useCallback(
        (
            element: NonDeletedExcalidrawElement,
            event: CustomEvent<{
                nativeEvent: MouseEvent | React.PointerEvent<HTMLCanvasElement>;
            }>
        ) => {
            const link = element.link!;
            const { nativeEvent } = event.detail;
            const isNewTab = nativeEvent.ctrlKey || nativeEvent.metaKey;
            const isNewWindow = nativeEvent.shiftKey;
            const isInternalLink = link.startsWith("/") || link.includes(window.location.origin);
            if (isInternalLink && !isNewTab && !isNewWindow) {
                // signal that we're handling the redirect ourselves
                event.preventDefault();
                // do a custom redirect, such as passing to react-router
                // ...
            }
        },
        []
    );

    const [pointerData, setPointerData] = useState<{
        pointer: { x: number; y: number };
        button: "down" | "up";
        pointersMap: Gesture["pointers"];
    } | null>(null);

    const onPointerDown = (activeTool: AppState["activeTool"], pointerDownState: ExcalidrawPointerDownState) => {
        if (activeTool.type === "custom" && activeTool.customType === "comment") {
            const { x, y } = pointerDownState.origin;
            setComment({ x, y, value: "" });
        }
    };

    const renderMenu = () => {
        return (
            <MainMenu>
                <MainMenu.DefaultItems.SaveAsImage />
                {/* <MainMenu.DefaultItems.Export  /> */}
                <MainMenu.Separator />

                <MainMenu.DefaultItems.ChangeCanvasBackground />

                <MainMenu.Separator />

                <MainMenu.DefaultItems.ClearCanvas />

                {/* {excalidrawAPI && <MobileFooter excalidrawLib={excalidrawLib} excalidrawAPI={excalidrawAPI} />}  */}
            </MainMenu>
        );
    };

    return (
        <div className="App" ref={appRef}>
            <h1>{appTitle}</h1>
            <div className="export-wrapper button-wrapper">
                <label className="export-wrapper__checkbox">
                    <input type="checkbox" checked={exportWithDarkMode} onChange={() => setExportWithDarkMode(!exportWithDarkMode)} />
                    Export with dark mode
                </label>
                <label className="export-wrapper__checkbox">
                    <input type="checkbox" checked={exportEmbedScene} onChange={() => setExportEmbedScene(!exportEmbedScene)} />
                    Export with embed scene
                </label>

                <button
                    onClick={async () => {
                        if (!excalidrawAPI) {
                            return;
                        }
                        const blob = await exportToBlob({
                            elements: excalidrawAPI?.getSceneElements(),
                            mimeType: "image/png",
                            appState: {
                                ...initialData.appState,
                                exportEmbedScene,
                                exportWithDarkMode,
                            },
                            files: excalidrawAPI?.getFiles(),
                        });
                        setBlobUrl(window.URL.createObjectURL(blob));
                    }}
                >
                    Export to IMG
                </button>
                <div className="export export-blob">
                    <img src={blobUrl} alt="" />
                </div>

                <div className="button-wrapper">
                    <button
                        className="reset-scene"
                        onClick={() => {
                            excalidrawAPI?.resetScene();
                        }}
                    >
                        Reset Scene
                    </button>
                </div>
            </div>
            <div className="excalidraw-wrapper">{renderExcalidraw(children)}</div>
        </div>
    );
}
